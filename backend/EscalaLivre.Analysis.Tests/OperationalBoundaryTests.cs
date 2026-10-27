using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Planning;
using EscalaLivre.Application.Scheduling;
using EscalaLivre.Domain.Regimes;
using EscalaLivre.Domain.Planning;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Analysis.Tests;

public sealed class OperationalBoundaryTests
{
    [Theory]
    [InlineData("dayBased", "hourBased")]
    [InlineData("hourBased", "dayBased")]
    public void BuiltInRegimesRejectRulesWhoseUnitsBelongToAnotherRegime(string strategy, string configuration)
    {
        IShiftRegime regime = strategy == "dayBased" ? new DayBasedRegime() : new HourBasedRegime();
        var rule = new WorkloadRule(configuration, 8, 2, 43.75, TimeSpan.FromHours(8));
        var start = new DateTime(2026, 10, 19, 8, 0, 1);
        Assert.Throws<ArgumentException>(() => regime.CanWork(start, start.AddHours(1), [], rule));
        Assert.Throws<ArgumentException>(() => regime.EstimateStartAfterRest(start, rule));
    }

    [Fact]
    public void WeeklyTranslationMustNotTurnAnUnrepresentableLimitIntoANegativeBudget()
    {
        Assert.Throws<OverflowException>(() => ScheduleCapacityPolicy.WeeklyLimitTicks(new WeeklyHours(double.MaxValue)));
    }

    [Fact]
    public void GenerationMappingCannotReturnAnAliasThatBypassesTheProtectedReplacement()
    {
        var request = AnalysisContractTests.Request();
        var tags = new List<string> { "selected" };
        var selected = request.Document.Assignments.Single() with { Tags = tags };
        var historyTags = new List<string> { "history" };
        var history = selected with { Id = Guid.NewGuid(), Start = selected.Start.AddDays(-7), End = selected.End.AddDays(-7), Break = null, Tags = historyTags };
        request = request with { Document = request.Document with { Assignments = new List<ShiftAssignment> { history } } };
        var complete = new List<ShiftAssignment> { history, selected };
        var applied = PlanningDocumentMapping.ApplyGeneration(request, [selected], complete);
        complete.Clear(); tags[0] = "changed-after-validation"; historyTags.Clear();
        Assert.Equal(2, applied.Count);
        Assert.Equal("history", applied[0].Tags.Single());
        Assert.Equal("selected", applied[1].Tags.Single());
        Assert.Equal(selected.Start, applied[1].Start);
        Assert.Equal(selected.End, applied[1].End);
        Assert.Equal(selected.Break, applied[1].Break);
        Assert.Throws<NotSupportedException>(() => ((IList<ShiftAssignment>)applied).Clear());
        Assert.Throws<NotSupportedException>(() => ((IList<string>)applied[1].Tags).Clear());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void SuccessfulUseCaseKeepsAcceptedAssignmentsAndDecisionsStableAfterAdapterMutation(bool duringEvaluation)
    {
        var request = AnalysisContractTests.Request();
        var tags = new List<string> { "opening" };
        var selected = request.Document.Assignments.Single() with { Tags = tags };
        request = request with { Document = request.Document with { Assignments = [] } };
        var complete = new List<ShiftAssignment> { selected };
        var selectedList = new List<ShiftAssignment> { selected };
        void ReuseAdapterBuffers() { complete.Clear(); selectedList.Clear(); tags.Clear(); }
        var result = new GenerateSchedule(new Optimizer(new(complete, selectedList, "feasible", [])),
            new Analyzer(duringEvaluation ? ReuseAdapterBuffers : () => { })).Execute(request);
        Assert.Contains(result.Optimization?.Status, new[] { "optimal", "feasible" });
        var factors = Assert.Single(result.Decisions).Factors.ToArray();
        ReuseAdapterBuffers();
        Assert.Equal(selected.Id, Assert.Single(result.Assignments).Id);
        Assert.Equal("opening", result.Assignments[0].Tags.Single());
        Assert.Equal(selected.Id, Assert.Single(result.Decisions).AssignmentId);
        Assert.Equal(factors, result.Decisions[0].Factors);
        Assert.Empty(request.Document.Assignments);
    }

    private sealed class Optimizer(ScheduleOptimizationResult result) : IScheduleOptimizer
    {
        public ScheduleOptimizationResult Optimize(EscalaLivre.Application.Contracts.ScheduleRequest request) => result;
    }

    private sealed class Analyzer(Action whileEvaluating) : IScheduleAnalyzer
    {
        public ScheduleResult Analyze(EscalaLivre.Application.Contracts.ScheduleRequest request)
        {
            whileEvaluating();
            return new ScheduleAnalyzer(new ScheduleEvaluator()).Analyze(request);
        }
    }

    [Fact]
    public void TypedCapacityPreservesFractionalWeeklyHoursAndSecondsWithoutMixingDays()
    {
        var days = new DayCycleConfiguration(new(5), new(2), new(1.25), new(TimeSpan.FromHours(25)));
        Assert.Equal(7, DayCyclePolicy.Length(days.RollingCycle));
        Assert.Equal(2, ScheduleCapacityPolicy.RemainingCycleDates(days.RollingCycle, new(3)));
        Assert.Equal(0, ScheduleCapacityPolicy.RemainingCycleDates(days.RollingCycle, new(6)));
        Assert.Equal(TimeSpan.TicksPerSecond, ScheduleCapacityPolicy.RemainingWeeklyTicks(days.WeeklyLimit, new(TimeSpan.FromSeconds(4499))));
        Assert.Equal(0, ScheduleCapacityPolicy.RemainingWeeklyTicks(days.WeeklyLimit, new(TimeSpan.FromHours(2))));
        Assert.Equal(TimeSpan.FromHours(25), days.DefaultShiftDuration.Value);
    }

    [Fact]
    public void ValidatedSettingsResolveInheritanceWithoutReinterpretingPersonalHourUnitsAsDays()
    {
        var request = AnalysisContractTests.Request();
        var employee = request.Document.Employees[0] with { InheritsCompanyDefaults = true,
            Workload = new("hourBased", 24, 36, 43.75, TimeSpan.FromHours(24)) };
        var settings = new PlanningSettings(request.Document.Company, [employee]);
        Assert.Same(settings.DefaultRegime, settings.RegimeFor(employee.Id));
        Assert.IsType<DayCycleConfiguration>(settings.RegimeFor(employee.Id));
        var personal = settings.WithEmployee(employee.Id, employee with { InheritsCompanyDefaults = false });
        var hours = Assert.IsType<HourCycleConfiguration>(personal.RegimeFor(employee.Id));
        Assert.Equal(36, hours.RestHours.Value);
        Assert.Equal(43.75, hours.WeeklyLimit.Value);
        Assert.Throws<ArgumentException>(() => settings.RegimeFor(Guid.NewGuid()));
    }
}
