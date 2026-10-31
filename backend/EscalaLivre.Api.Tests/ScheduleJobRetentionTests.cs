using System.Collections.Concurrent;
using System.Text.Json;
using EscalaLivre.Api;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Scheduling;
using Microsoft.Extensions.Logging.Abstractions;

namespace EscalaLivre.Api.Tests;

public sealed class ScheduleJobRetentionTests
{
    private const int MiB = 1024 * 1024;
    private static ScheduleResult Result(string status = "optimal") => new([], [], [], [], [], [], [], 1, new(status));
    private static ScheduleRequest Request() => ScheduleJobQueueTests.Request();
    private sealed class Runner(Func<CancellationToken, Task<ScheduleResult>> run) : ICalculationRunner
    {
        public Task<ScheduleResult> RunAsync(string operation, ScheduleRequest request, CancellationToken cancellation) => run(cancellation);
    }

    private static ScheduleJobQueue Queue(ICalculationRunner runner, ProtectionOptions? options = null, TimeProvider? clock = null) =>
        new(runner, options ?? new(), NullLogger<ScheduleJobQueue>.Instance, clock);

    private static async Task Until(Func<bool> ready)
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        while (!ready()) await Task.Delay(1, deadline.Token);
    }

    [Fact]
    public async Task ResultIsRetainedUntilExactlyTwoMinutesAfterCompletionAndSnapshotsAreDetached()
    {
        var clock = new ManualClock();
        var release = new TaskCompletionSource<ScheduleResult>(TaskCreationOptions.RunContinuationsAsynchronously);
        using var queue = Queue(new Runner(_ => release.Task), clock:clock);
        await queue.StartAsync(default);
        try
        {
            var job = queue.Enqueue(Request());
            await Until(() => queue.Get(job.Id).State == "processing");
            clock.Advance(TimeSpan.FromMinutes(5));
            Assert.Equal("processing", queue.Get(job.Id).State);
            release.SetResult(Result());
            await Until(() => queue.Get(job.Id).State == "completed");
            var retained = queue.Get(job.Id).Result!;
            Assert.NotSame(retained, queue.Get(job.Id).Result);
            clock.Advance(TimeSpan.FromSeconds(119));
            Assert.Equal("optimal", queue.Get(job.Id).Result!.Optimization!.Status);
            Assert.Equal("completed", queue.Cancel(job.Id).State); // Idempotent; does not extend retention.
            clock.Advance(TimeSpan.FromSeconds(1));
            Assert.Equal("jobExpired", Assert.Throws<ApiFailure>(() => queue.Get(job.Id)).Code);
            Assert.Equal((0, 0L), queue.RetentionUsage);
        }
        finally { release.TrySetResult(Result()); await queue.StopAsync(default); }
    }

    [Fact]
    public async Task ActiveReservationsAndRetainedPayloadExhaustBudgetAndExpiryRestoresAdmission()
    {
        var clock = new ManualClock();
        var release = new TaskCompletionSource<ScheduleResult>(TaskCreationOptions.RunContinuationsAsynchronously);
        using var queue = Queue(new Runner(c => release.Task.WaitAsync(c)), new() {JobPayloadBudgetMb=4}, clock);
        await queue.StartAsync(default);
        try
        {
            var job = queue.Enqueue(Request());
            await Until(() => queue.Get(job.Id).State == "processing");
            Assert.Equal(4L * MiB, queue.RetentionUsage.PayloadBytes);
            Assert.Equal("queueFull", Assert.Throws<ApiFailure>(() => queue.Enqueue(Request())).Code);
            release.SetResult(Result());
            await Until(() => queue.Get(job.Id).State == "completed");
            Assert.Equal(JsonSerializer.SerializeToUtf8Bytes(Result(), ScheduleJson.CreateOptions()).Length,
                queue.RetentionUsage.PayloadBytes);
            // Retained result plus another full 4 MiB reservation would exceed the budget.
            Assert.Equal(503, Assert.Throws<ApiFailure>(() => queue.Enqueue(Request())).Status);
            clock.Advance(TimeSpan.FromMinutes(2));
            var next = queue.Enqueue(Request());
            await Until(() => queue.Get(next.Id).State == "completed");
            Assert.Equal("jobExpired", Assert.Throws<ApiFailure>(() => queue.Get(job.Id)).Code);
        }
        finally { await queue.StopAsync(default); }
    }

    [Fact]
    public void QueuedCancellationReleasesReservationButMetadataRemainsBoundedUntilExpiry()
    {
        var clock = new ManualClock();
        using var queue = Queue(new Runner(_ => Task.FromResult(Result())), new() {JobPayloadBudgetMb=4, JobRetentionLimit=32}, clock);
        var ids = new List<string>();
        for (int i = 0; i < 32; i++)
        {
            var job = queue.Enqueue(Request());
            ids.Add(job.Id);
            Assert.Equal("cancelled", queue.Cancel(job.Id).State);
            Assert.Equal("cancelled", queue.Cancel(job.Id).State);
            Assert.Equal(0, queue.RetentionUsage.PayloadBytes);
        }
        Assert.Equal((32, 0L), queue.RetentionUsage);
        Assert.Equal(503, Assert.Throws<ApiFailure>(() => queue.Enqueue(Request())).Status);
        Assert.All(ids, id => Assert.Equal("cancelled", queue.Get(id).State));
        clock.Advance(TimeSpan.FromMinutes(2));
        Assert.Equal("queued", queue.Enqueue(Request()).State);
        Assert.Equal((1, 4L * MiB), queue.RetentionUsage);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task FailureAndOversizedResultsReleaseReservationWithoutDiscardingTerminalStatus(bool oversized)
    {
        using var queue = Queue(new Runner(_ => oversized
            ? Task.FromResult(Result(new string('x', 4 * MiB)))
            : Task.FromException<ScheduleResult>(new ApiFailure(422, "test", new string('e', 2048)))),
            new() {JobPayloadBudgetMb=4});
        await queue.StartAsync(default);
        try
        {
            for (int i = 0; i < 3; i++)
            {
                var job = queue.Enqueue(Request());
                await Until(() => queue.Get(job.Id).State == "failed");
                var failed = queue.Get(job.Id);
                Assert.Null(failed.Result);
                Assert.InRange(failed.Error!.Length, 1, 512);
                Assert.Equal(0, queue.RetentionUsage.PayloadBytes);
            }
        }
        finally { await queue.StopAsync(default); }
    }

    [Fact]
    public async Task RunningCancellationDoesNotReleaseBudgetOrSlotBeforeRunnerExits()
    {
        var cancellationSeen = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var exited = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var queue = Queue(new Runner(async token =>
        {
            try { await Task.Delay(Timeout.Infinite, token); }
            catch (OperationCanceledException) { cancellationSeen.SetResult(); }
            await exited.Task; // Models time spent killing/reaping the process.
            return Result(); // Cancellation must win over a racing successful return.
        }), new() {JobPayloadBudgetMb=4});
        await queue.StartAsync(default);
        try
        {
            var job = queue.Enqueue(Request());
            await Until(() => queue.Get(job.Id).State == "processing");
            Assert.Equal("processing", queue.Cancel(job.Id).State);
            await cancellationSeen.Task.WaitAsync(TimeSpan.FromSeconds(5));
            Assert.Equal(4L * MiB, queue.RetentionUsage.PayloadBytes);
            Assert.Equal(503, Assert.Throws<ApiFailure>(() => queue.Enqueue(Request())).Status);
            exited.SetResult();
            await Until(() => queue.Get(job.Id).State == "cancelled");
            Assert.Equal(0, queue.RetentionUsage.PayloadBytes);
            Assert.Null(queue.Get(job.Id).Result);
            queue.Enqueue(Request());
        }
        finally { exited.TrySetResult(); await queue.StopAsync(default); }
    }

    [Fact]
    public async Task ParallelWorkersTakeWaitingJobsInFifoOrderAndRespectExecutionLimit()
    {
        var started = new ConcurrentQueue<DateTime>();
        var releases = Enumerable.Range(0, 4).Select(_ => new TaskCompletionSource<ScheduleResult>(TaskCreationOptions.RunContinuationsAsynchronously)).ToArray();
        int active = 0, maximum = 0;
        var runner = new OrderedRunner(async request =>
        {
            int index = (int)(request.Start - new DateTime(2026, 10, 19)).TotalDays;
            var count = Interlocked.Increment(ref active);
            UpdateMaximum(ref maximum, count);
            started.Enqueue(request.Start);
            try { return await releases[index].Task; }
            finally { Interlocked.Decrement(ref active); }
        });
        using var queue = Queue(runner, new() {ConcurrentWorkers=2, JobQueueLimit=2});
        await queue.StartAsync(default);
        try
        {
            var first = queue.Enqueue(Request());
            await Until(() => started.Count == 1);
            var second = queue.Enqueue(Request() with {Start=Request().Start.AddDays(1)});
            await Until(() => started.Count == 2);
            var third = queue.Enqueue(Request() with {Start=Request().Start.AddDays(2)});
            var fourth = queue.Enqueue(Request() with {Start=Request().Start.AddDays(3)});
            Assert.Equal(503, Assert.Throws<ApiFailure>(() => queue.Enqueue(Request())).Status);
            releases[0].SetResult(Result());
            await Until(() => started.Count == 3);
            Assert.Equal("queued", queue.Get(fourth.Id).State);
            releases[1].SetResult(Result());
            await Until(() => started.Count == 4);
            Assert.Equal(Enumerable.Range(0, 4).Select(i => Request().Start.AddDays(i)), started);
            Assert.Equal(2, maximum);
        }
        finally { foreach (var release in releases) release.TrySetResult(Result()); await queue.StopAsync(default); }
        Assert.Equal(0, active);
    }

    private sealed class OrderedRunner(Func<ScheduleRequest, Task<ScheduleResult>> run) : ICalculationRunner
    {
        public Task<ScheduleResult> RunAsync(string operation, ScheduleRequest request, CancellationToken cancellation) => run(request);
    }

    private static void UpdateMaximum(ref int target, int value)
    {
        int current;
        do { current = Volatile.Read(ref target); if (current >= value) return; }
        while (Interlocked.CompareExchange(ref target, value, current) != current);
    }

    [Fact]
    public async Task PeriodicCleanupAndConcurrentPollingCompletionAndCancellationAreSafe()
    {
        var clock = new ManualClock();
        var release = new TaskCompletionSource<ScheduleResult>(TaskCreationOptions.RunContinuationsAsynchronously);
        using var queue = Queue(new Runner(_ => release.Task), clock:clock);
        await queue.StartAsync(default);
        await clock.TimerCreated.Task.WaitAsync(TimeSpan.FromSeconds(5));
        var job = queue.Enqueue(Request());
        try
        {
            await Until(() => queue.Get(job.Id).State == "processing");
            var polling = Task.Run(() =>
            {
                for (int i = 0; i < 500; i++)
                {
                    try
                    {
                        var progress = queue.Get(job.Id);
                        Assert.Contains(progress.State, new[] {"processing", "completed", "cancelled"});
                        if (progress.State == "completed") Assert.NotNull(progress.Result);
                    }
                    catch (ApiFailure expired) { Assert.Equal("jobExpired", expired.Code); }
                }
            });
            var cancellation = Task.Run(() =>
            {
                try { queue.Cancel(job.Id); }
                catch (ApiFailure expired) { Assert.Equal("jobExpired", expired.Code); }
            });
            var cleanup = Task.Run(() =>
            {
                for (int i = 0; i < 6; i++) clock.Advance(TimeSpan.FromSeconds(30));
            });
            release.SetResult(Result());
            await Task.WhenAll(polling, cancellation, cleanup);
            await Until(() =>
            {
                try { return queue.Get(job.Id).State is "completed" or "cancelled"; }
                catch (ApiFailure expired) { Assert.Equal("jobExpired", expired.Code); return true; }
            });
            // This timer tick prunes without Get/Enqueue driving cleanup.
            clock.Advance(TimeSpan.FromMinutes(2));
            await Until(() => queue.RetentionUsage.Tickets == 0);
            Assert.Equal(0, queue.RetentionUsage.PayloadBytes);
            queue.Enqueue(Request());
        }
        finally { release.TrySetResult(Result()); await queue.StopAsync(default); }
    }

    [Fact]
    public void SerializationHonorsExactFourMiBBoundaryWithoutRetainingOversizedPayload()
    {
        int overhead = JsonSerializer.SerializeToUtf8Bytes(Result(""), ScheduleJson.CreateOptions()).Length;
        var atLimit = Result(new string('x', 4 * MiB - overhead));
        Assert.Equal(4 * MiB, JobPayload.Serialize(atLimit).Length);
        Assert.Equal("resultLimit", Assert.Throws<ApiFailure>(() => JobPayload.Serialize(
            atLimit with {Optimization=new(atLimit.Optimization!.Status + "x")})).Code);
    }

    [Fact]
    public void OversizedAdmissionDoesNotLeakBudgetOrTicket()
    {
        using var queue = Queue(new Runner(_ => Task.FromResult(Result())), new() {JobPayloadBudgetMb=4});
        var oversized = Request();
        oversized = oversized with {Document=oversized.Document with {Company=oversized.Document.Company with {Name=new string('x', 4 * MiB)}}};
        Assert.Equal("resultLimit", Assert.Throws<ApiFailure>(() => queue.Enqueue(oversized)).Code);
        Assert.Equal((0, 0L), queue.RetentionUsage);
        Assert.Equal("queued", queue.Enqueue(Request()).State);
    }

    [Fact]
    public async Task SerializedSnapshotsPreserveWholeResultAndDoNotShareMutableInputsOrOutputs()
    {
        var days = new List<DayOfWeek> {DayOfWeek.Monday};
        var request = Request();
        request = request with {Document=request.Document with {Company=request.Document.Company with {OperatingDays=days}}};
        var start = request.Start.AddHours(22).AddSeconds(1);
        var end = start.AddHours(8).AddSeconds(1);
        var person = Guid.NewGuid();
        var tags = new List<string> {"autorizado"};
        var shift = new ShiftAssignment(Guid.NewGuid(), person, "A", start, end,
            new(start.AddHours(4), start.AddHours(5)), "manual", tags, Guid.NewGuid());
        var result = Result() with
        {
            Assignments=[shift],
            Conflicts=[new("warning", "existing", "Conflito preservado", start, end, "A", person)],
            Coverage=[new(start, end, "A", 2, 1, "partial")],
            Gaps=[new(start, end, "A", 1)],
            HiringSuggestions=[new("A", 1, 1, 44, 1, 1, [new(new(2026, 10, 18), 1)], [new(start, end)], "Demanda")],
            OptimizationSuggestions=[new("code", "Sugestão", "high", person, start, end)],
            Decisions=[new(shift.Id, person, "Mantido", ["histórico"])],
            CoverageScore=0.5
        };
        var jsonOptions = ScheduleJson.CreateOptions();
        string expected = JsonSerializer.Serialize(result, jsonOptions);
        using var queue = Queue(new OrderedRunner(input =>
        {
            Assert.Equal(new[] {DayOfWeek.Monday}, input.Document.Company.OperatingDays);
            return Task.FromResult(result);
        }));
        var job = queue.Enqueue(request);
        days.Clear();
        await queue.StartAsync(default);
        try
        {
            await Until(() => queue.Get(job.Id).State == "completed");
            tags.Add("alterado depois da conclusão");
            var snapshot = queue.Get(job.Id).Result!;
            Assert.Equal(expected, JsonSerializer.Serialize(snapshot, jsonOptions));
            Assert.IsAssignableFrom<IList<string>>(snapshot.Assignments[0].Tags).Add("alterado na consulta");
            Assert.Equal(expected, JsonSerializer.Serialize(queue.Get(job.Id).Result, jsonOptions));
        }
        finally { await queue.StopAsync(default); }
    }

    private sealed class ManualClock : TimeProvider
    {
        private readonly object gate = new();
        private DateTimeOffset now = DateTimeOffset.UnixEpoch;
        private readonly List<ManualTimer> timers = [];
        public TaskCompletionSource TimerCreated { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public override DateTimeOffset GetUtcNow() { lock (gate) return now; }
        public override ITimer CreateTimer(TimerCallback callback, object? state, TimeSpan dueTime, TimeSpan period)
        {
            lock (gate)
            {
                var timer = new ManualTimer(this, callback, state);
                timers.Add(timer);
                timer.Change(dueTime, period);
                TimerCreated.TrySetResult();
                return timer;
            }
        }
        public void Advance(TimeSpan delta)
        {
            ManualTimer[] due;
            lock (gate)
            {
                now += delta;
                due = timers.Where(t => t.Next <= now).ToArray();
                foreach (var timer in due) timer.Next = timer.Period == Timeout.InfiniteTimeSpan ? DateTimeOffset.MaxValue : now + timer.Period;
            }
            foreach (var timer in due) timer.Callback(timer.State);
        }
        private sealed class ManualTimer(ManualClock clock, TimerCallback callback, object? state) : ITimer
        {
            public TimerCallback Callback { get; } = callback;
            public object? State { get; } = state;
            public DateTimeOffset Next;
            public TimeSpan Period;
            public bool Change(TimeSpan dueTime, TimeSpan period)
            {
                lock (clock.gate)
                { Period = period; Next = dueTime == Timeout.InfiniteTimeSpan ? DateTimeOffset.MaxValue : clock.now + dueTime; return true; }
            }
            public void Dispose() { lock (clock.gate) clock.timers.Remove(this); }
            public ValueTask DisposeAsync() { Dispose(); return ValueTask.CompletedTask; }
        }
    }
}
