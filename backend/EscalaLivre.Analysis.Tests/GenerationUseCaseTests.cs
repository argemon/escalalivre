using System.Text.Json;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Scheduling;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Analysis.Tests;

public sealed class GenerationUseCaseTests
{
    private sealed class Optimizer(ScheduleOptimizationResult result) : IScheduleOptimizer
    {
        public ScheduleRequest? Received { get; private set; }
        public ScheduleOptimizationResult Optimize(ScheduleRequest request) { Received = request; return result; }
    }

    private sealed class Analyzer : IScheduleAnalyzer
    {
        public int Calls { get; private set; }
        public ScheduleRequest? Received { get; private set; }
        public ScheduleResult Analyze(ScheduleRequest request)
        {
            Calls++;
            Received = request;
            return new ScheduleAnalyzer(new ScheduleEvaluator()).Analyze(request);
        }
    }

    [Theory]
    [InlineData("timeout", "solverTimeout")]
    [InlineData("infeasible", "solverInfeasible")]
    [InlineData("invalid", "solverInvalid")]
    public void FailedOptimizationRetainsAssignmentsAndExistingConflicts(string status, string code)
    {
        var request = AnalysisContractTests.Request("over-four-hours-needs-fifteen-minutes");
        var issue = new ScheduleIssue("error", code, "Failure", request.Start, request.End);
        var optimizer = new Optimizer(new(request.Document.Assignments, [], status, [issue]));
        var analyzer = new Analyzer();
        var result = new GenerateSchedule(optimizer, analyzer).Execute(request);
        Assert.Same(request, optimizer.Received);
        Assert.Same(request.Document.Assignments, result.Assignments);
        Assert.Equal(status, result.Optimization?.Status);
        Assert.Equal(issue, result.Conflicts.Last());
        Assert.Contains(result.Conflicts, c => c.Code == "interval");
        Assert.Empty(result.Decisions);
        Assert.Equal(1, analyzer.Calls);
    }

    [Fact]
    public void SuccessfulOptimizationEvaluatesFullHistoryButExplainsOnlySelectedAssignments()
    {
        var request = AnalysisContractTests.Request();
        var selected = request.Document.Assignments.Single();
        var history = selected with { Id = Guid.NewGuid(), Start = selected.Start.AddDays(-7), End = selected.End.AddDays(-7), Break = null };
        ShiftAssignment[] complete = [history, selected];
        request = request with { Document = request.Document with { Assignments = [history] } };
        var optimizer = new Optimizer(new(complete, [selected], "feasible", []));
        var analyzer = new Analyzer();
        var result = new GenerateSchedule(optimizer, analyzer).Execute(request);
        Assert.Equal(1, analyzer.Calls);
        Assert.Equal(JsonSerializer.Serialize(complete, ScheduleJson.CreateOptions()), JsonSerializer.Serialize(result.Assignments, ScheduleJson.CreateOptions()));
        Assert.NotSame(complete, result.Assignments);
        Assert.Same(result.Assignments, analyzer.Received!.Document.Assignments);
        Assert.Equal(selected.Id, Assert.Single(result.Decisions).AssignmentId);
        Assert.Equal("feasible", result.Optimization?.Status);
        Assert.Same(history, Assert.Single(request.Document.Assignments));
    }
}
