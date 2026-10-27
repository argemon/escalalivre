using EscalaLivre.Application.Validation;
using EscalaLivre.Domain.Planning;
using EscalaLivre.Domain.Regimes;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Analysis.Tests;

public sealed class RegimeExtensionTests
{
    private static readonly DateTime Start = new(2026, 10, 19, 8, 0, 1);
    private static readonly WorkloadRule Rule = new("testCombined", 2, 13, 43.75, TimeSpan.FromHours(2));

    // Deliberately outside the product mapper/schema. Combines existing families without new consumers.
    private sealed record CombinedConfiguration : RegimeConfiguration
    {
        private readonly DayCycleLimit cycle;
        public override Duration MaximumShiftWork { get; }
        public override Duration RestBetweenShifts { get; }
        public override DayCycleLimit RollingCycle => cycle;

        public CombinedConfiguration(WorkloadRule rule) : base(new(rule.WeeklyLimitHours), new(rule.DefaultShiftDuration))
        {
            MaximumShiftWork = new(TimeSpan.FromHours(new WholeHours(rule.WorkUnits).Value));
            RestBetweenShifts = new(TimeSpan.FromHours(new WholeHours(rule.RestUnits).Value));
            cycle = new(new(1), new(1));
        }
    }

    private sealed class CombinedStrategy(string type = "testCombined") : IShiftRegime
    {
        public string Type => type;
        public bool CanWork(DateTime start, DateTime end, IReadOnlyList<ShiftAssignment> history, WorkloadRule rule, BreakWindow? pause = null)
            => RegimeEligibility.CanWork(new CombinedConfiguration(rule), start, end, history, pause);
        public DateTime EstimateStartAfterRest(DateTime end, WorkloadRule rule)
            => end.Add(new CombinedConfiguration(rule).RestBetweenShifts.Value);
    }

    [Theory]
    [InlineData("empty", true)]
    [InlineData("long", false)]
    [InlineData("rest", false)]
    [InlineData("cycle", false)]
    public void AnAdditionalStrategyCanReuseGenericEligibilityAndExistingConstraintFamilies(string scenario, bool allowed)
    {
        var registry = new ShiftRegimeFactory([new DayBasedRegime(), new HourBasedRegime(), new CombinedStrategy()]);
        var strategy = registry.Resolve("TESTCOMBINED");
        var history = scenario switch
        {
            "rest" => new[] { Shift(Start.AddHours(-2), Start.AddHours(-1)) }, // Same start date; only rest rejects.
            "cycle" => new[] { Shift(Start.AddDays(-1), Start.AddDays(-1).AddHours(1)) }, // Rest fits; cycle rejects.
            _ => Array.Empty<ShiftAssignment>()
        };
        var end = Start.AddHours(2).AddSeconds(scenario == "long" ? 1 : 0);
        var before = history.ToArray();
        Assert.Equal(allowed, strategy.CanWork(Start, end, history, Rule));
        Assert.Equal(allowed, strategy.CanWork(Start, end, history.Reverse().Concat(history).ToArray(), Rule));
        Assert.Equal(before, history);
        Assert.Equal(end.AddHours(13), strategy.EstimateStartAfterRest(end, Rule));
        var configuration = new CombinedConfiguration(Rule);
        Assert.Equal(TimeSpan.FromHours(13), RestPolicy.Required(new(TimeSpan.FromHours(11)), configuration).Value);
        Assert.Equal(TimeSpan.FromMinutes(75).Ticks,
            ScheduleCapacityPolicy.WeeklyLimitTicks(new WeeklyHours(1.25)));
        Assert.Equal(0, ScheduleCapacityPolicy.RemainingCycleDates(configuration.RollingCycle, new(1)));
    }

    [Theory]
    [InlineData("testCombined")]
    [InlineData("unknown")]
    [InlineData("DAYBASED")]
    [InlineData("dayBased ")]
    public void InternalRegistrationDoesNotExposeANewProductConfiguration(string type)
    {
        Assert.False(RegimeConfiguration.IsSupported(type));
        Assert.Throws<ArgumentException>(() => RegimeConfiguration.From(Rule with { RegimeType = type }));
        var request = AnalysisContractTests.Request();
        Assert.NotNull(DocumentSafety.Error(request.Document with
        {
            Company = request.Document.Company with { DefaultWorkload = request.Document.Company.DefaultWorkload with { RegimeType = type } }
        }));
        Assert.NotNull(DocumentSafety.Error(request.Document with
        {
            Employees = request.Document.Employees.Select(e => e with { Workload = e.Workload with { RegimeType = type } }).ToArray()
        }));
    }

    [Fact]
    public void AdditionalStrategyStillUsesDuplicateRegistrationProtection()
        => Assert.Throws<ArgumentException>(() => new ShiftRegimeFactory([new CombinedStrategy(), new CombinedStrategy("TESTCOMBINED")]));

    [Fact]
    public void NullRegimeRestAndExplicitZeroRestRetainDifferentPartialContracts()
    {
        var history = new[] { Shift(Start, Start.AddHours(1)) };
        var days = RegimeConfiguration.From(new("dayBased", 7, 0, 44, TimeSpan.FromHours(2)));
        var hours = RegimeConfiguration.From(new("hourBased", 2, 0, 44, TimeSpan.FromHours(2)));
        Assert.Null(days.RestBetweenShifts);
        Assert.Equal(TimeSpan.Zero, hours.RestBetweenShifts!.Value);
        Assert.True(RegimeEligibility.CanWork(days, Start, Start.AddHours(2), history));
        Assert.False(RegimeEligibility.CanWork(hours, Start, Start.AddHours(2), history));
    }

    private static ShiftAssignment Shift(DateTime start, DateTime end)
        => new(Guid.NewGuid(), Guid.NewGuid(), "A", start, end, null, "manual", []);

    [Fact]
    public void RollingCycleIsAnIndependentValidatedValueRatherThanTheEntireRegime()
    {
        var configuration = new DayCycleConfiguration(new(5), new(2), new(44), new(TimeSpan.FromHours(8)));
        Assert.Equal(new DayCycleLimit(new(5), new(2)), configuration.RollingCycle);
        Assert.Contains("CycleDays", configuration.ToString());
        Assert.Throws<ArgumentException>(() => new DayCycleLimit(new(0), new(1)));
        Assert.Throws<ArgumentException>(() => new DayCycleLimit(new(int.MaxValue), new(1)));
    }
}
