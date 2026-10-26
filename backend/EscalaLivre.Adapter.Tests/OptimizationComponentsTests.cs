using System.Text.Json;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Scheduling;
using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Infrastructure.Solver;
using Google.OrTools.Sat;

namespace EscalaLivre.Adapter.Tests;

public sealed class OptimizationComponentsTests
{
    private static readonly DateTime Monday = new(2026, 10, 19);
    private static ScheduleRequest Request()
    {
        var rule = new WorkloadRule("dayBased", 7, 0, 44, TimeSpan.FromHours(2));
        var employee = new Employee(Guid.NewGuid(), "A", "A", true, rule, [], [], [], false, true, []);
        var company = new CompanyRules("Loja", new(0, 0), new(0, 0), Enum.GetValues<DayOfWeek>(), rule,
            new(TimeSpan.Zero, TimeSpan.FromHours(2), TimeSpan.FromHours(1)), TimeSpan.FromHours(11),
            [new("A", DayOfWeek.Monday, new(8, 0), new(10, 0), 1)]);
        return new(new("1.0.0", Guid.NewGuid(), company, [employee], [], DateTimeOffset.UtcNow), Monday, Monday.AddDays(1).AddSeconds(-1));
    }
    private static ShiftAssignment Shift(ScheduleRequest r, DateTime start, double hours = 2)
        => new(Guid.NewGuid(), r.Document.Employees[0].Id, "A", start, start.AddHours(hours), null, "solver", []);
    private static ScheduleModelContext Model(ScheduleRequest r, params ShiftAssignment[] candidates)
    {
        var budget = new OptimizationBudget();
        return AdapterComposition.Builder().Build(new(r, candidates, budget), budget);
    }
    private static CpSolverStatus Forced(ScheduleModelContext context, params ShiftAssignment[] selected)
    {
        foreach (var a in selected) context.Model.Add(context.DecisionVars[a.Id] == 1);
        return new OrToolsExecution().Solve(context.Model).Status;
    }

    [Fact]
    public void SmallFeasibleModelSelectsCoverageAndReaderPreservesHistory()
    {
        var r = Request();var historical = Shift(r, Monday.AddDays(-8).AddHours(8));
        r = r with { Document = r.Document with { Assignments = [historical] } };
        var candidate = Shift(r, Monday.AddHours(8));var context = Model(r, candidate);
        var run = new OrToolsExecution().Solve(context.Model);
        Assert.Contains(run.Status, new[] { CpSolverStatus.Optimal, CpSolverStatus.Feasible });
        var result = new ScheduleResultReader().Read(context, run);
        Assert.Equal(candidate.Id, Assert.Single(result.SelectedAssignments).Id);
        Assert.Same(historical, result.Assignments[0]);
        Assert.DoesNotContain(ScheduleRules.Diagnose(r.Document, result.Assignments), i => i.Severity == "error");
    }

    [Fact]
    public void DailyExclusivityMakesTwoForcedCandidatesInfeasible()
    {
        var r = Request();var a = Shift(r, Monday.AddHours(8));var b = Shift(r, Monday.AddHours(14));
        Assert.Equal(CpSolverStatus.Infeasible, Forced(Model(r, a, b), a, b));
    }

    [Theory]
    [InlineData(-1, -1, false)]
    [InlineData(-1, 0, true)]
    [InlineData(1, -1, false)]
    [InlineData(1, 0, true)]
    public void RestTranslationHasSecondPrecisionAtBothPreservedEdges(int side, int seconds, bool feasible)
    {
        var r = Request();var candidate = Shift(r, side < 0 ? Monday.AddHours(11).AddSeconds(seconds) : Monday.AddHours(22));
        var history = Shift(r, side < 0 ? Monday.AddDays(-1).AddHours(22) : Monday.AddDays(1).AddHours(11).AddSeconds(seconds));
        r = r with { Document = r.Document with { Assignments = [history] } };
        var status = Forced(Model(r, candidate), candidate);
        Assert.Equal(feasible, status is CpSolverStatus.Optimal or CpSolverStatus.Feasible);
        if (!feasible) Assert.Equal(CpSolverStatus.Infeasible, status);
    }

    [Theory]
    [InlineData(2, false)]
    [InlineData(4, true)]
    public void WeeklyTranslationDeductsPreservedWork(double limit, bool feasible)
    {
        var r = Request();r = r with { Document = r.Document with { Company = r.Document.Company with { DefaultWorkload = r.Document.Company.DefaultWorkload with { WeeklyLimitHours = limit } } } };
        var history = Shift(r, Monday.AddDays(-1).AddHours(8));
        r = r with { Document = r.Document with { Assignments = [history] } };
        var candidate = Shift(r, Monday.AddHours(8));var status = Forced(Model(r, candidate), candidate);
        Assert.Equal(feasible, status is CpSolverStatus.Optimal or CpSolverStatus.Feasible);
    }

    [Theory]
    [InlineData(false, true)]
    [InlineData(true, false)]
    public void CycleTranslationCanUseBothSidesOfThePeriod(bool future, bool feasible)
    {
        var r = Request();var rule = r.Document.Company.DefaultWorkload with { WorkUnits = 2, RestUnits = 1 };
        var history = new List<ShiftAssignment> { Shift(r, Monday.AddDays(-1).AddHours(8)) };
        if (future) history.Add(Shift(r, Monday.AddDays(1).AddHours(8)));
        r = r with { Document = r.Document with { Company = r.Document.Company with { DefaultWorkload = rule }, Assignments = history } };
        var candidate = Shift(r, Monday.AddHours(8));var status = Forced(Model(r, candidate), candidate);
        Assert.Equal(feasible, status is CpSolverStatus.Optimal or CpSolverStatus.Feasible);
    }

    [Fact]
    public void CoverageGapIsAnObjectivePenaltyAndDoesNotMakeAModelInfeasible()
    {
        var r = Request();r = r with { Document = r.Document with { Company = r.Document.Company with { Coverage = [r.Document.Company.Coverage[0] with { MinimumEmployees = 2 }] } } };
        var candidate = Shift(r, Monday.AddHours(8));var context = Model(r, candidate);
        var run = new OrToolsExecution().Solve(context.Model);
        var result = new ScheduleResultReader().Read(context, run);
        Assert.Contains(result.Status, new[] { "optimal", "feasible" });
        Assert.Equal(0.5, ScheduleCoverage.Evaluate(r.Document, r.Start, r.End, result.Assignments).Score);
    }

    [Fact]
    public void NativeZeroDeadlineReturnsUnknownAndTheReaderKeepsOriginalData()
    {
        var r = Request();var original = Shift(r, Monday.AddHours(5));r = r with { Document = r.Document with { Assignments = [original] } };
        var context = Model(r, Shift(r, Monday.AddHours(8)));
        var run = new OrToolsExecution().Solve(context.Model, 0); // Test-only overload; production remains 5s/one worker.
        Assert.Equal(CpSolverStatus.Unknown, run.Status);
        var result = new ScheduleResultReader().Read(context, run);
        Assert.Equal("timeout", result.Status);Assert.Same(r.Document.Assignments, result.Assignments);
        Assert.Empty(result.SelectedAssignments);Assert.Equal("solverTimeout", Assert.Single(result.Issues).Code);
        Assert.Equal(5, OrToolsExecution.MaximumSeconds);
    }

    [Fact]
    public void RealInfeasibleModelCannotReplaceOriginalAssignments()
    {
        var r = Request();var original = Shift(r, Monday.AddHours(5));r = r with { Document = r.Document with { Assignments = [original] } };
        var context = Model(r, Shift(r, Monday.AddHours(8)));
        context.Model.Add(LinearExpr.Constant(0) == 1);
        var run = new OrToolsExecution().Solve(context.Model);Assert.Equal(CpSolverStatus.Infeasible, run.Status);
        var result = new ScheduleResultReader().Read(context, run);
        Assert.Equal("infeasible", result.Status);Assert.Same(r.Document.Assignments, result.Assignments);Assert.Empty(result.SelectedAssignments);
    }

    [Fact]
    public void NativeInvalidModelHasTheExistingInvalidStatusAndEnvelopeCode()
    {
        var r = Request();var context = Model(r, Shift(r, Monday.AddHours(8)));
        context.Model.Model.Constraints.Add(new ConstraintProto { BoolOr = new BoolArgumentProto { Literals = { 999999 } } });
        var run = new OrToolsExecution().Solve(context.Model);Assert.Equal(CpSolverStatus.ModelInvalid, run.Status);
        var result = new ScheduleResultReader().Read(context, run);
        Assert.Equal("invalid", result.Status);Assert.Equal("solverInvalid", Assert.Single(result.Issues).Code);
        Assert.Same(r.Document.Assignments, result.Assignments);
    }

    [Fact]
    public void CandidateAndStepBudgetsRetainTheirExactBoundaries()
    {
        var r = Request();var a = Shift(r, Monday.AddHours(8));var budget = new OptimizationBudget();
        Assert.Equal(30_000, new ScheduleModelInput(r, Enumerable.Repeat(a, 30_000), budget).Candidates.Count);
        Assert.Throws<ScheduleComplexityException>(() => new ScheduleModelInput(r, Enumerable.Repeat(a, 30_001), new()));
        for (int i = 0; i < 300_000; i++) budget.Spend();
        Assert.Equal(300_000, budget.ModelSteps);Assert.Throws<ScheduleComplexityException>(() => budget.Spend());
        Assert.Empty(r.Document.Assignments);
    }

    [Fact]
    public void FixedCoverageAlsoConsumesTheCandidateBudget()
    {
        var r = Request();var history = Shift(r, Monday.AddDays(-1).AddHours(23));
        r = r with { Document = r.Document with { Assignments = [history] } };
        Assert.Throws<ScheduleComplexityException>(() => new ScheduleModelInput(r, Enumerable.Repeat(Shift(r, Monday), 30_000), new()));
        Assert.Same(history, Assert.Single(r.Document.Assignments));
    }

    [Fact]
    public void ObjectivePreservesWeightsPreferenceClampAndSecondTruncation()
    {
        var r = Request();var a = Shift(r, Monday.AddHours(8));var e = r.Document.Employees[0];
        Assert.Equal(-1_000_000, ScheduleObjective.CandidateWeight(r.Document.Company, e, a));
        Assert.Equal(-999_900, ScheduleObjective.CandidateWeight(r.Document.Company, e, a with { Tags = ["closing"] }));
        e = e with { Preferences = [new("preferred", 5000, "")] };
        Assert.Equal(-999_000, ScheduleObjective.CandidateWeight(r.Document.Company, e, a with { Tags = ["preferred"] }));
        Assert.Equal(-16_666_666, ScheduleObjective.ShortageWeight(TimeSpan.FromSeconds(1)));
        Assert.Equal(166, ScheduleObjective.OccupancyWeight(TimeSpan.FromSeconds(1)));
        Assert.Equal(-60_000_000_000, ScheduleObjective.ShortageWeight(TimeSpan.FromHours(1)));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    public void D1RegressionCountsEachPersonOnceWithoutRepairingHistory(int scenarioIndex)
    {
        using var fixtures = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "solver-regression-scenarios.json")));
        var r = fixtures.RootElement.GetProperty("scenarios")[scenarioIndex].GetProperty("request").Deserialize<ScheduleRequest>(ScheduleJson.CreateOptions())!;
        var before = JsonSerializer.Serialize(r, ScheduleJson.CreateOptions());
        var result = AdapterComposition.Generate().Execute(r);
        Assert.Contains(result.Optimization?.Status, new[] { "optimal", "feasible" });Assert.Empty(result.Gaps);Assert.Equal(1, result.CoverageScore);
        Assert.Contains(result.Conflicts, i => i.Code == "multipleShifts");
        foreach (var a in r.Document.Assignments) Assert.Same(a, Assert.Single(result.Assignments, item => item.Id == a.Id));
        Assert.Equal(before, JsonSerializer.Serialize(r, ScheduleJson.CreateOptions()));
    }
}
