using System.Text.Json;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Scheduling;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Analysis.Tests;

public sealed class GenerationConformanceTests
{
    private static readonly DateTime Monday = new(2026, 10, 19);
    private static ScheduleRequest Request()
    {
        var r = AnalysisContractTests.Request();
        var rule = new WorkloadRule("dayBased", 7, 0, 44, TimeSpan.FromHours(2));
        var person = r.Document.Employees[0] with { Workload = rule, Availability = [], Restrictions = [], AllowsNightWork = true };
        var company = r.Document.Company with { DefaultWorkload = rule, MinimumRest = TimeSpan.FromHours(11),
            Lunch = new(TimeSpan.Zero, TimeSpan.FromHours(2), TimeSpan.FromHours(1)), OpensAt = new(0, 0), ClosesAt = new(0, 0),
            OperatingDays = Enum.GetValues<DayOfWeek>(), Coverage = [] };
        return new(r.Document with { Company = company, Employees = [person], Assignments = [], PlanningPeriod = null }, Monday, Monday.AddDays(1).AddSeconds(-1));
    }
    private static ShiftAssignment Shift(ScheduleRequest r, DateTime start, double hours = 2)
        => new(Guid.NewGuid(), r.Document.Employees[0].Id, r.Document.Employees[0].Role, start, start.AddHours(hours), null, "manual", []);
    private sealed class Optimizer(ScheduleOptimizationResult result) : IScheduleOptimizer
    {
        public ScheduleOptimizationResult Optimize(ScheduleRequest request) => result;
    }
    private static ScheduleResult Generate(ScheduleRequest r, IReadOnlyList<ShiftAssignment> selected, string status = "feasible", IReadOnlyList<ShiftAssignment>? proposal = null)
        => new GenerateSchedule(new Optimizer(new(proposal ?? ScheduleWindow.Replace(r.Document.Assignments, selected, r.Start, r.End), selected, status, [])),
            new ScheduleAnalyzer(new ScheduleEvaluator())).Execute(r);

    [Fact]
    public void ANewShiftErrorIsRejectedAndOriginalDiagnosticsDescribeTheReturnedDocument()
    {
        var r = Request();var bad = Shift(r, Monday.AddHours(8), 5);
        var before = JsonSerializer.Serialize(r, ScheduleJson.CreateOptions());
        var result = Generate(r, [bad]);
        Assert.Equal("invalid", result.Optimization?.Status);Assert.Same(r.Document.Assignments, result.Assignments);
        Assert.Empty(result.Decisions);Assert.Single(result.Conflicts, i => i.Code == "solverInvalid");
        Assert.DoesNotContain(result.Conflicts, i => i.Code == "workload");
        Assert.Equal(before, JsonSerializer.Serialize(r, ScheduleJson.CreateOptions()));
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(1)]
    public void NewRestConflictsAtEitherPreservedEdgeAreRejected(int side)
    {
        var r = Request();var candidate = Shift(r, side < 0 ? Monday : Monday.AddHours(22));
        var historical = Shift(r, side < 0 ? Monday.AddDays(-1).AddHours(22) : Monday.AddDays(1).AddHours(1));
        r = r with { Document = r.Document with { Assignments = [historical] } };
        var result = Generate(r, [candidate]);
        Assert.Equal("invalid", result.Optimization?.Status);Assert.Same(r.Document.Assignments, result.Assignments);
    }

    [Fact]
    public void UnchangedInheritedErrorsDoNotRejectAnUnrelatedValidAddition()
    {
        var r = Request();var history = Shift(r, Monday.AddDays(-8).AddHours(8), 5);
        r = r with { Document = r.Document with { Assignments = [history] } };
        var result = Generate(r, [Shift(r, Monday.AddHours(8))]);
        Assert.Equal("feasible", result.Optimization?.Status);
        Assert.Contains(result.Conflicts, i => i.Code == "workload");Assert.Single(result.Decisions);
        Assert.Equal(JsonSerializer.Serialize(history, ScheduleJson.CreateOptions()), JsonSerializer.Serialize(result.Assignments[0], ScheduleJson.CreateOptions()));
    }

    [Fact]
    public void WorseningAnAlreadyInvalidWeekIsRejectedEvenWhenTheDiagnosticKeyDoesNotChange()
    {
        var r = Request();r = r with { Document = r.Document with { Company = r.Document.Company with { DefaultWorkload = r.Document.Company.DefaultWorkload with { WeeklyLimitHours = 1 } } } };
        var history = Shift(r, Monday.AddDays(-1).AddHours(8));
        r = r with { Document = r.Document with { Assignments = [history] } };
        var added = Shift(r, Monday.AddHours(8));
        var prior = ScheduleRules.Diagnose(r.Document, [history]).Single(i => i.Code == "weeklyLimit");
        var proposed = ScheduleRules.Diagnose(r.Document, [history, added]).Single(i => i.Code == "weeklyLimit");
        Assert.Equal(prior, proposed);
        var result = Generate(r, [added]);Assert.Equal("invalid", result.Optimization?.Status);
        Assert.Same(r.Document.Assignments, result.Assignments);
    }

    [Fact]
    public void RemovingOldWorkDoesNotWhitelistItsFormerViolation()
    {
        var r = Request();r = r with { Document = r.Document with { Assignments = [Shift(r, Monday.AddHours(8), 5)] } };
        var result = Generate(r, [Shift(r, Monday.AddHours(8), 5)]);
        Assert.Equal("invalid", result.Optimization?.Status);Assert.Same(r.Document.Assignments, result.Assignments);
    }

    [Fact]
    public void InheritedCycleCannotBeWorsenedAtAFuturePreservedShift()
    {
        var r = Request();var rule = r.Document.Company.DefaultWorkload with { WorkUnits = 1, RestUnits = 2 };
        r = r with { Document = r.Document with { Company = r.Document.Company with { DefaultWorkload = rule } } };
        var before = Shift(r, Monday.AddDays(-1).AddHours(8));var after = Shift(r, Monday.AddDays(1).AddHours(8));
        r = r with { Document = r.Document with { Assignments = [before, after] } };
        Assert.Contains(ScheduleRules.Diagnose(r.Document, r.Document.Assignments), i => i.Code == "regime");
        var result = Generate(r, [Shift(r, Monday.AddHours(8))]);
        Assert.Equal("invalid", result.Optimization?.Status);Assert.Same(r.Document.Assignments, result.Assignments);
    }

    [Theory]
    [InlineData("timeout")]
    [InlineData("infeasible")]
    [InlineData("invalid")]
    public void FailureCannotApplyEvenAnIncorrectPortProposal(string status)
    {
        var r = Request();var selected = Shift(r, Monday.AddHours(8));
        var result = Generate(r, [selected], status, [selected]);
        Assert.Same(r.Document.Assignments, result.Assignments);Assert.Empty(result.Decisions);
    }

    [Fact]
    public void AStructurallyInvalidOrRewrittenHistoryProposalBecomesADiagnosticFailure()
    {
        var r = Request();var original = Shift(r, Monday.AddDays(-1).AddHours(8));
        r = r with { Document = r.Document with { Assignments = [original] } };
        var result = Generate(r, [], proposal: []);
        Assert.Equal("invalid", result.Optimization?.Status);Assert.Same(r.Document.Assignments, result.Assignments);
        Assert.Contains(result.Conflicts, i => i.Code == "solverInvalid");
    }

    [Fact]
    public void TwoNewShiftsOnTheSameDateAreRejectedAsABatch()
    {
        var r = Request();var result = Generate(r, [Shift(r, Monday.AddHours(8)), Shift(r, Monday.AddHours(21))]);
        Assert.Equal("invalid", result.Optimization?.Status);Assert.Same(r.Document.Assignments, result.Assignments);
        Assert.Contains(result.Conflicts, i => i.Code == "solverInvalid" && i.Message.Contains("multipleShifts"));
    }

    [Fact]
    public void CancellationPropagatesWithoutMutatingTheRequest()
    {
        var r = Request();var before = JsonSerializer.Serialize(r, ScheduleJson.CreateOptions());
        Assert.Throws<OperationCanceledException>(() => new GenerateSchedule(new CancelledOptimizer(), new ScheduleAnalyzer(new ScheduleEvaluator())).Execute(r));
        Assert.Equal(before, JsonSerializer.Serialize(r, ScheduleJson.CreateOptions()));
    }
    private sealed class CancelledOptimizer : IScheduleOptimizer
    {
        public ScheduleOptimizationResult Optimize(ScheduleRequest request) => throw new OperationCanceledException();
    }
}
