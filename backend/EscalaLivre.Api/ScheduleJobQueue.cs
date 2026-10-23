using System.Security.Cryptography;
using System.Text.Json;
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
    ILogger<ScheduleJobQueue> logger) : BackgroundService
{
    private sealed class Job(string id, ScheduleRequest request)
    {
        public string Id { get; } = id;
        public ScheduleRequest? Request = request;
        public DateTimeOffset Created = DateTimeOffset.UtcNow;
        public DateTimeOffset? Started, Finished;
        public string State = "queued";
        public ScheduleResult? Result;
        public string? Error;
        public CancellationTokenSource Cancellation = new();
    }

    private readonly object gate = new();
    private readonly List<Job> jobs = [];
    private readonly SemaphoreSlim available = new(0);
    private double averageSeconds = 8;
    private bool stopping;

    public JobProgress Enqueue(ScheduleRequest request)
    {
        lock (gate)
        {
            Prune();
            if (stopping || jobs.Count >= 32 || jobs.Count(j => j.State == "queued") >= options.JobQueueLimit)
                throw new ApiFailure(503, "queueFull", "A fila de geração está cheia. Aguarde um pouco e tente novamente.");
            var job = new Job(Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant(), request);
            jobs.Add(job);
            available.Release();
            return Snapshot(job);
        }
    }

    public JobProgress Get(string id)
    {
        lock (gate) { Prune(); return Snapshot(Find(id)); }
    }

    public JobProgress Cancel(string id)
    {
        lock (gate)
        {
            Prune();
            var job = Find(id);
            if (job.State == "queued")
            {
                job.Request = null;
                job.State = "cancelled";
                job.Finished = DateTimeOffset.UtcNow;
            }
            // A running slot stays occupied until the calculation process really exits.
            job.Cancellation.Cancel();
            return Snapshot(job);
        }
    }

    private Job Find(string id) => jobs.FirstOrDefault(j => j.Id == id)
        ?? throw new ApiFailure(404, "jobExpired", "Este pedido expirou ou o servidor foi reiniciado. Gere a escala novamente.");

    private void Prune()
    {
        foreach (var job in jobs.Where(j => j.Finished < DateTimeOffset.UtcNow.AddMinutes(-2)).ToArray())
        {
            jobs.Remove(job);
            job.Cancellation.Dispose();
        }
    }

    private JobProgress Snapshot(Job job)
    {
        var now = DateTimeOffset.UtcNow;
        var earlier = jobs.TakeWhile(j => j != job).Count(j => j.State == "queued");
        var running = jobs.Count(j => j.State == "processing");
        var queued = job.State == "queued";
        var runEstimate = Math.Max(1, (int)Math.Ceiling(averageSeconds));
        return new(job.Id, job.State, queued ? earlier + 1 : 0, queued ? earlier + running : 0,
            queued ? (int)Math.Ceiling((earlier + running) / (double)options.ConcurrentWorkers) * runEstimate : 0,
            runEstimate, (int)((job.Finished ?? now) - job.Created).TotalSeconds,
            job.Started is { } start ? (int)((job.Finished ?? now) - start).TotalSeconds : 0,
            options.WorkerTimeoutSeconds, 3, job.Result, job.Error);
    }

    protected override Task ExecuteAsync(CancellationToken stoppingToken) =>
        Task.WhenAll(Enumerable.Range(0, options.ConcurrentWorkers).Select(_ => Work(stoppingToken)).Append(Cleanup(stoppingToken)));

    private async Task Cleanup(CancellationToken cancellation)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30));
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
            ScheduleRequest request;
            lock (gate)
            {
                job = jobs.FirstOrDefault(j => j.State == "queued");
                if (job is null) continue;
                request = job.Request!;
                job.Request = null;
                job.State = "processing";
                job.Started = DateTimeOffset.UtcNow;
            }
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken, job.Cancellation.Token);
            try
            {
                var result = await runner.RunAsync("solve", request, linked.Token);
                // Retention is capped at 32 jobs / 4 MiB per result / two minutes.
                if (JsonSerializer.SerializeToUtf8Bytes(result, ScheduleJson.CreateOptions()).Length > 4 * 1024 * 1024)
                    throw new ApiFailure(422, "resultLimit", "O resultado é muito grande. Reduza o período ou a equipe.");
                lock (gate)
                {
                    if (linked.IsCancellationRequested) job.State = "cancelled";
                    else { job.Result = result; job.State = "completed"; }
                    averageSeconds = averageSeconds * 0.75 + Math.Min(options.WorkerTimeoutSeconds,
                        (DateTimeOffset.UtcNow - job.Started!.Value).TotalSeconds) * 0.25;
                }
            }
            catch (OperationCanceledException) { lock (gate) job.State = "cancelled"; }
            catch (Exception error)
            {
                lock (gate)
                {
                    job.State = "failed";
                    job.Error = error is ApiFailure failure ? failure.Message : "Não foi possível concluir a geração. Tente novamente.";
                }
                logger.LogWarning("Queued calculation failed: {Type}", error.GetType().Name);
            }
            finally { lock (gate) job.Finished = DateTimeOffset.UtcNow; }
        }
    }

    public override Task StopAsync(CancellationToken cancellationToken)
    {
        lock (gate) stopping = true;
        return base.StopAsync(cancellationToken);
    }
}
