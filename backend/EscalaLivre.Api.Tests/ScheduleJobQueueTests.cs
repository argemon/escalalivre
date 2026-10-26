using EscalaLivre.Api;
using EscalaLivre.Application.Contracts;
using Microsoft.Extensions.Logging.Abstractions;

namespace EscalaLivre.Api.Tests;

public sealed class ScheduleJobQueueTests
{
    // Queue mechanics do not inspect the document; HTTP validates it before admission.
    private static ScheduleRequest Request() => new(null!, DateTime.Today, DateTime.Today.AddHours(1));
    private sealed class BlockingRunner : ICalculationRunner
    {
        public int Active, Maximum;
        public TaskCompletionSource Started = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Release = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public async Task<ScheduleResult> RunAsync(string operation, ScheduleRequest request, CancellationToken cancellation)
        {
            var active = Interlocked.Increment(ref Active);
            Maximum = Math.Max(Maximum, active);
            Started.TrySetResult();
            try { await Release.Task.WaitAsync(cancellation); throw new ApiFailure(422, "test", "Falha conhecida"); }
            finally { Interlocked.Decrement(ref Active); }
        }
    }

    [Fact]
    public async Task QueueReportsRealPositionAndCancellationFreesWaitingCapacity()
    {
        var runner = new BlockingRunner();
        using var queue = new ScheduleJobQueue(runner, new() { JobQueueLimit = 2 }, NullLogger<ScheduleJobQueue>.Instance);
        await queue.StartAsync(default);
        var first = queue.Enqueue(Request());
        await runner.Started.Task.WaitAsync(TimeSpan.FromSeconds(5));
        var second = queue.Enqueue(Request());
        var third = queue.Enqueue(Request());
        Assert.Equal("processing", queue.Get(first.Id).State);
        Assert.Equal(1, second.Position);
        Assert.Equal(1, second.JobsAhead);
        Assert.Equal(2, third.Position);
        Assert.Equal(2, third.JobsAhead);
        Assert.True(third.EstimatedWaitSeconds >= second.EstimatedWaitSeconds);
        Assert.Equal(503, Assert.Throws<ApiFailure>(() => queue.Enqueue(Request())).Status);
        Assert.Equal("cancelled", queue.Cancel(second.Id).State);
        Assert.Equal(1, queue.Get(third.Id).Position);
        queue.Enqueue(Request());
        Assert.Equal(404, Assert.Throws<ApiFailure>(() => queue.Get(new string('0', 64))).Status);
        await queue.StopAsync(default);
        Assert.Equal(0, runner.Active);
        Assert.Equal(1, runner.Maximum);
    }

    [Fact]
    public async Task RunningCancellationReleasesSlotAndNextJobRunsWithoutParallelism()
    {
        var runner = new BlockingRunner();
        using var queue = new ScheduleJobQueue(runner, new(), NullLogger<ScheduleJobQueue>.Instance);
        await queue.StartAsync(default);
        var first = queue.Enqueue(Request());
        await runner.Started.Task.WaitAsync(TimeSpan.FromSeconds(5));
        var second = queue.Enqueue(Request());
        queue.Cancel(first.Id);
        await Until(() => queue.Get(second.Id).State == "processing");
        Assert.Equal("cancelled", queue.Get(first.Id).State);
        runner.Release.TrySetResult();
        await Until(() => queue.Get(second.Id).State == "failed");
        Assert.Equal("Falha conhecida", queue.Get(second.Id).Error);
        Assert.Equal(1, runner.Maximum);
        await queue.StopAsync(default);
    }

    private static async Task Until(Func<bool> ready)
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        while (!ready()) await Task.Delay(10, deadline.Token);
    }
}
