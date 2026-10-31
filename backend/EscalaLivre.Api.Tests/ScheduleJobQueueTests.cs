using EscalaLivre.Api;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Scheduling;
using Microsoft.Extensions.Logging.Abstractions;

namespace EscalaLivre.Api.Tests;

public sealed class ScheduleJobQueueTests
{
    private sealed class SmallResultRunner : ICalculationRunner
    {
        public Task<ScheduleResult> RunAsync(string operation, ScheduleRequest request, CancellationToken cancellation) =>
            Task.FromResult(new ScheduleResult([], [], [], [], [], [], [], 1, new("optimal")));
    }

    [Fact]
    public async Task MoreThanThirtyTwoSmallCompletionsDoNotBlockAdmissionOrEvictResults()
    {
        using var queue = new ScheduleJobQueue(new SmallResultRunner(), new(), NullLogger<ScheduleJobQueue>.Instance);
        await queue.StartAsync(default);
        try
        {
            var ids = new List<string>();
            for (int i = 0; i < 40; i++)
            {
                var job = queue.Enqueue(Request());
                ids.Add(job.Id);
                await Until(() => queue.Get(job.Id).State == "completed");
            }
            foreach (string id in ids)
            {
                var retained = queue.Get(id);
                Assert.Equal("completed", retained.State);
                Assert.Equal("optimal", retained.Result!.Optimization!.Status);
            }
        }
        finally { await queue.StopAsync(default); }
    }

    // A structurally serializable request; HTTP owns business/input validation.
    internal static ScheduleRequest Request()
    {
        var rule = new WorkloadRule("dayBased", 7, 0, 44, TimeSpan.FromHours(8));
        var company = new CompanyRules("Loja", new(8, 0), new(18, 0), [DayOfWeek.Monday], rule,
            new(TimeSpan.FromHours(1), TimeSpan.FromHours(1), TimeSpan.FromHours(4)), TimeSpan.FromHours(11), []);
        var day = new DateTime(2026, 10, 19);
        return new(new("1.0.0", Guid.NewGuid(), company, [], [], DateTimeOffset.UnixEpoch), day, day.AddHours(1));
    }
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
        Assert.Equal(0, queue.RetentionUsage.PayloadBytes);
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
