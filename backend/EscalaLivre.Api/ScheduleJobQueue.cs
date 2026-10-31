using System.Security.Cryptography;
using EscalaLivre.Application.Contracts;

namespace EscalaLivre.Api;

public interface ICalculationRunner
{
    Task<ScheduleResult> RunAsync(string operation, ScheduleRequest request, CancellationToken cancellation);
}

public sealed record JobProgress(string Id, string State, int Position, int JobsAhead,
    int EstimatedWaitSeconds, int EstimatedRunSeconds, int ElapsedSeconds, int ProcessingSeconds,
    int WorkerTimeoutSeconds, int PollAfterSeconds, ScheduleResult? Result = null, string? Error = null);

// One process, bounded memory, FIFO. Tokens are bearer secrets; never log job IDs or documents.
public sealed class ScheduleJobQueue(ICalculationRunner runner, ProtectionOptions options,
    ILogger<ScheduleJobQueue> logger, TimeProvider? timeProvider = null) : BackgroundService
{
    private sealed class Job(string id, byte[] request, DateTimeOffset created)
    {
        public string Id { get; } = id;
        public byte[]? Payload = request;
        public DateTimeOffset Created = created;
        public DateTimeOffset? Started, Finished;
        public string State = "queued";
        public string? Error;
        public CancellationTokenSource? Cancellation;
        public long PayloadCharge = JobPayload.MaximumBytes;
    }

    private readonly object gate = new();
    private readonly List<Job> jobs = [];
    // Coalesced wake-ups: cancelled queued jobs cannot accumulate semaphore permits.
    private readonly SemaphoreSlim available = new(0, 1);
    private readonly TimeProvider clock = timeProvider ?? TimeProvider.System;
    private long payloadCharge;
    private double averageSeconds = 8;
    private bool stopping;

    internal (int Tickets, long PayloadBytes) RetentionUsage
    {
        get { lock (gate) return (jobs.Count, payloadCharge); }
    }

    public JobProgress Enqueue(ScheduleRequest request)
    {
        lock (gate)
        {
            Prune();
            if (stopping || jobs.Count >= options.JobRetentionLimit
                || jobs.Count(j => j.State == "queued") >= options.JobQueueLimit
                || payloadCharge + JobPayload.MaximumBytes > options.JobPayloadBudgetMb * 1024L * 1024)
                throw new ApiFailure(503, "queueFull", "A fila de geração está cheia. Aguarde um pouco e tente novamente.");
            var job = new Job(Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant(),
                JobPayload.Serialize(request), clock.GetUtcNow());
            jobs.Add(job);
            payloadCharge += job.PayloadCharge;
            Signal();
            return Snapshot(job);
        }
    }

    public JobProgress Get(string id)
    {
        JobProgress progress;
        byte[]? result;
        lock (gate)
        {
            Prune();
            var job = Find(id);
            progress = Snapshot(job);
            result = job.State == "completed" ? job.Payload : null;
        }
        return WithResult(progress, result);
    }

    public JobProgress Cancel(string id)
    {
        JobProgress progress;
        byte[]? result;
        lock (gate)
        {
            Prune();
            var job = Find(id);
            if (job.State == "queued")
            {
                Finish(job, "cancelled", null, null);
            }
            // A running slot stays occupied until the calculation process really exits.
            if (job.State == "processing") job.Cancellation!.Cancel();
            progress = Snapshot(job);
            result = job.State == "completed" ? job.Payload : null;
        }
        return WithResult(progress, result);
    }

    private Job Find(string id) => jobs.FirstOrDefault(j => j.Id == id)
        ?? throw new ApiFailure(404, "jobExpired", "Este pedido expirou ou o servidor foi reiniciado. Gere a escala novamente.");

    private void Prune()
    {
        var expiry = clock.GetUtcNow().AddMinutes(-2);
        foreach (var job in jobs.Where(j => j.Finished <= expiry).ToArray())
        {
            jobs.Remove(job);
            payloadCharge -= job.PayloadCharge;
            job.Payload = null;
        }
    }

    private static JobProgress WithResult(JobProgress progress, byte[]? result) => result is null
        ? progress : progress with { Result = JobPayload.Deserialize<ScheduleResult>(result) };

    private void Signal()
    {
        if (available.CurrentCount == 0) available.Release();
    }

    // Terminal publication is atomic under gate. Running jobs reach here only
    // after the runner has returned (and reaped its child).
    private void Finish(Job job, string state, byte[]? result, string? error)
    {
        payloadCharge -= job.PayloadCharge;
        job.PayloadCharge = result?.Length ?? 0;
        payloadCharge += job.PayloadCharge;
        job.Payload = result;
        job.Error = error;
        job.State = state;
        job.Finished = clock.GetUtcNow();
        job.Cancellation?.Dispose();
        job.Cancellation = null;
    }

    private JobProgress Snapshot(Job job)
    {
        var now = clock.GetUtcNow();
        var earlier = jobs.TakeWhile(j => j != job).Count(j => j.State == "queued");
        var running = jobs.Count(j => j.State == "processing");
        var queued = job.State == "queued";
        var runEstimate = Math.Max(1, (int)Math.Ceiling(averageSeconds));
        return new(job.Id, job.State, queued ? earlier + 1 : 0, queued ? earlier + running : 0,
            queued ? (int)Math.Ceiling((earlier + running) / (double)options.ConcurrentWorkers) * runEstimate : 0,
            runEstimate, (int)((job.Finished ?? now) - job.Created).TotalSeconds,
            job.Started is { } start ? (int)((job.Finished ?? now) - start).TotalSeconds : 0,
            options.WorkerTimeoutSeconds, 3, Error: job.Error);
    }

    protected override Task ExecuteAsync(CancellationToken stoppingToken) =>
        Task.WhenAll(Enumerable.Range(0, options.ConcurrentWorkers).Select(_ => Work(stoppingToken)).Append(Cleanup(stoppingToken)));

    private async Task Cleanup(CancellationToken cancellation)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30), clock);
        try { while (await timer.WaitForNextTickAsync(cancellation)) { lock (gate) Prune(); } }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { }
    }

    private async Task Work(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try { await available.WaitAsync(stoppingToken); }
            catch (OperationCanceledException) { break; }
            Job? job;
            byte[] request;
            lock (gate)
            {
                job = jobs.FirstOrDefault(j => j.State == "queued");
                if (job is null) continue;
                request = job.Payload!;
                job.Payload = null;
                job.State = "processing";
                job.Started = clock.GetUtcNow();
                job.Cancellation = new();
                if (jobs.Any(j => j.State == "queued")) Signal();
            }
            byte[]? result = null;
            string? errorMessage = null;
            string state = "completed";
            try
            {
                using var linked = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken, job.Cancellation.Token);
                var input = JobPayload.Deserialize<ScheduleRequest>(request);
                request = [];
                result = JobPayload.Serialize(await runner.RunAsync("solve", input, linked.Token));
            }
            catch (OperationCanceledException) { state = "cancelled"; }
            catch (Exception error)
            {
                state = "failed";
                errorMessage = error is ApiFailure failure ? failure.Message : "Não foi possível concluir a geração. Tente novamente.";
                errorMessage = errorMessage[..Math.Min(errorMessage.Length, 512)];
                logger.LogWarning("Queued calculation failed: {Type}", error.GetType().Name);
            }
            lock (gate)
            {
                if (stoppingToken.IsCancellationRequested || job.Cancellation!.IsCancellationRequested)
                { state = "cancelled"; errorMessage = null; }
                if (state == "completed")
                    averageSeconds = averageSeconds * 0.75 + Math.Min(options.WorkerTimeoutSeconds,
                        (clock.GetUtcNow() - job.Started!.Value).TotalSeconds) * 0.25;
                Finish(job, state, state == "completed" ? result : null, errorMessage);
            }
            request = [];
            result = null;
        }
    }

    public override Task StopAsync(CancellationToken cancellationToken)
    {
        lock (gate)
        {
            stopping = true;
            foreach (var job in jobs.Where(j => j.State == "queued")) Finish(job, "cancelled", null, null);
        }
        return base.StopAsync(cancellationToken);
    }
}
