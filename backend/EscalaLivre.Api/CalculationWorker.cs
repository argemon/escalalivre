using System.Diagnostics;
using System.Reflection;
using System.Text.Json;
using System.Threading.RateLimiting;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Validation;
using EscalaLivre.Application.Scheduling;
using EscalaLivre.Infrastructure.Solver;

namespace EscalaLivre.Api;

// Slots stay occupied until the child exits, including after cancellation.
public sealed class CalculationWorker(ProtectionOptions options, ILogger<CalculationWorker> logger, IHostApplicationLifetime lifetime) : ICalculationRunner, IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = ScheduleJson.CreateOptions();
    private readonly ConcurrencyLimiter limiter = new(new()
    {
        PermitLimit = options.ConcurrentWorkers, QueueLimit = options.QueueLimit, QueueProcessingOrder = QueueProcessingOrder.OldestFirst
    });

    public async Task<ScheduleResult> RunAsync(string operation, ScheduleRequest request, CancellationToken cancellation)
    {
        using var shutdown = CancellationTokenSource.CreateLinkedTokenSource(cancellation, lifetime.ApplicationStopping);
        cancellation = shutdown.Token;
        using var queueTimeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        queueTimeout.CancelAfter(TimeSpan.FromSeconds(options.QueueWaitSeconds));
        RateLimitLease lease;
        try { lease = await limiter.AcquireAsync(1, queueTimeout.Token); }
        catch (OperationCanceledException) when (!cancellation.IsCancellationRequested)
        { throw new ApiFailure(503, "busy", "O gerador está ocupado. Tente novamente em alguns segundos."); }
        using (lease)
        {
            if (!lease.IsAcquired) throw new ApiFailure(503, "busy", "A fila está cheia. Tente novamente em alguns segundos.");
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
            deadline.CancelAfter(TimeSpan.FromSeconds(options.WorkerTimeoutSeconds));
            var start = new ProcessStartInfo(Environment.ProcessPath!)
            {
                UseShellExecute = false, CreateNoWindow = true,
                RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true
            };
            if (string.Equals(Path.GetFileNameWithoutExtension(Environment.ProcessPath), "dotnet", StringComparison.OrdinalIgnoreCase))
                start.ArgumentList.Add(Assembly.GetExecutingAssembly().Location);
            start.ArgumentList.Add("--calculation-worker");
            start.ArgumentList.Add(operation);
            start.Environment["DOTNET_PROCESSOR_COUNT"] = "1";
            start.Environment["OMP_NUM_THREADS"] = "1";
            using var process = new Process { StartInfo = start };
            var stopwatch = Stopwatch.StartNew();
            Task<string>? output = null, errors = null;
            try
            {
                process.Start();
                logger.LogDebug("Calculation {Operation} started", operation);
                output = ReadBoundedAsync(process.StandardOutput, 32 * 1024 * 1024, deadline.Token);
                errors = ReadBoundedAsync(process.StandardError, 64 * 1024, deadline.Token);
                await process.StandardInput.WriteLineAsync(JsonSerializer.Serialize(request, JsonOptions).AsMemory(), deadline.Token);
                process.StandardInput.Close();
                while (!process.HasExited)
                {
                    deadline.Token.ThrowIfCancellationRequested();
                    var memory = ProcessMemorySample.Read(() =>
                    {
                        process.Refresh();
                        return process.WorkingSet64;
                    }, () => process.HasExited);
                    if (memory is null) break;
                    if (memory.Value > options.WorkerMemoryMb * 1024L * 1024)
                        throw new ApiFailure(422, "complexityLimit", "O planejamento excedeu o limite de memória. Reduza o período ou as regras.");
                    if (output.IsFaulted) await output;
                    if (errors.IsFaulted) await errors;
                    await Task.Delay(50, deadline.Token);
                }
                await errors;
                string json = await output;
                if (process.ExitCode == 2) throw new ApiFailure(422, "complexityLimit", "Planejamento muito complexo. Reduza o período, a equipe ou as regras.");
                if (process.ExitCode != 0) throw new ApiFailure(500, "calculationFailed", "Não foi possível concluir o cálculo.");
                return JsonSerializer.Deserialize<ScheduleResult>(json, JsonOptions)
                    ?? throw new ApiFailure(500, "calculationFailed", "Não foi possível concluir o cálculo.");
            }
            catch (OperationCanceledException) when (!cancellation.IsCancellationRequested)
            { throw new ApiFailure(504, "calculationTimeout", "O cálculo atingiu o tempo limite. Reduza o período ou as regras e tente novamente."); }
            finally
            {
                try
                {
                    if (!process.HasExited) process.Kill(entireProcessTree: true);
                    await process.WaitForExitAsync(CancellationToken.None);
                }
                catch (InvalidOperationException) { /* Process never started. */ }
                deadline.Cancel();
                // Observe pipe faults after killing the process. Never release its slot early.
                foreach (var task in new[] { output, errors })
                    if (task is not null) { try { await task; } catch { } }
                logger.LogInformation("Calculation {Operation} completed in {DurationMs}ms", operation, stopwatch.ElapsedMilliseconds);
            }
        }
    }

    private static async Task<string> ReadBoundedAsync(StreamReader reader, int limit, CancellationToken cancellation)
    {
        var result = new System.Text.StringBuilder();
        var buffer = new char[4096];
        int count;
        while ((count = await reader.ReadAsync(buffer.AsMemory(), cancellation)) > 0)
        {
            if (result.Length + count > limit) throw new ApiFailure(422, "resultLimit", "Resultado acima do limite permitido.");
            result.Append(buffer, 0, count);
        }
        return result.ToString();
    }

    public static async Task<int> ExecuteAsync(string operation)
    {
        try
        {
            var request = JsonSerializer.Deserialize<ScheduleRequest>((await Console.In.ReadLineAsync())!, JsonOptions);
            if (request is null || !(await new ScheduleRequestValidator().ValidateAsync(request)).IsValid) return 2;
            var services = new ServiceCollection().AddScheduleAnalysis();
            if (operation == "solve") services.AddScheduleOptimization();
            using var provider = services.BuildServiceProvider();
            var result = operation switch
            {
                "solve" => provider.GetRequiredService<GenerateSchedule>().Execute(request),
                "validate" => provider.GetRequiredService<ValidateSchedule>().Execute(request),
                "analyze" => provider.GetRequiredService<AnalyzeSchedule>().Execute(request),
                _ => throw new InvalidOperationException()
            };
            await Console.Out.WriteAsync(JsonSerializer.Serialize(result, JsonOptions));
            return 0;
        }
        catch (ScheduleComplexityException) { return 2; }
        catch { return 1; }
    }

    public void Dispose() => limiter.Dispose();
}
