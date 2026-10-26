using System.Text.Json;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Regimes;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Analysis.Tests;

// These tests record existing behavior, including known limitations. They do not approve it as a new rule.
public sealed class RegimeCharacterizationTests
{
    private static readonly DateTime Monday = new(2026, 10, 19);
    private static ShiftAssignment Shift(Guid employee, DateTime start, DateTime end)
        => new(Guid.NewGuid(), employee, "A", start, end, null, "manual", []);

    [Theory]
    [InlineData(-1, false)]
    [InlineData(0, true)]
    [InlineData(1, true)]
    public void HourRegimeRestHasSecondPrecisionOnBothSides(int seconds, bool allowed)
    {
        var rule = new WorkloadRule("hourBased", 4, 11, 44, TimeSpan.FromHours(4));
        var start = Monday.AddHours(8);
        var end = start.AddHours(4);
        var previousEnd = start.AddHours(-11).AddSeconds(-seconds);
        var nextStart = end.AddHours(11).AddSeconds(seconds);
        var regime = new HourBasedRegime();
        Assert.Equal(allowed, regime.CanWork(start, end, [Shift(Guid.NewGuid(), previousEnd.AddHours(-2), previousEnd)], rule));
        Assert.Equal(allowed, regime.CanWork(start, end, [Shift(Guid.NewGuid(), nextStart, nextStart.AddHours(2))], rule));
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(1)]
    public void DayRegimeCountsDistinctDatesAndIncludesFutureHistory(int side)
    {
        var start = Monday.AddHours(8);
        var employee = Guid.NewGuid();
        var history = Shift(employee, start.AddDays(side), start.AddDays(side).AddHours(2));
        var regime = new DayBasedRegime();
        Assert.False(regime.CanWork(start, start.AddHours(2), [history], new("dayBased", 1, 1, 44, TimeSpan.FromHours(2))));
        Assert.True(regime.CanWork(start, start.AddHours(2), [history, history with { Id = Guid.NewGuid() }], new("dayBased", 2, 1, 44, TimeSpan.FromHours(2))));
    }

    [Fact]
    public void NextEligibleStartIsOnlyALocalEstimateForDayRegime()
    {
        var rule = new WorkloadRule("dayBased", 1, 1, 44, TimeSpan.FromHours(2));
        var regime = new DayBasedRegime();
        var proposed = regime.EstimateStartAfterRest(Monday.AddHours(10), rule);
        var future = Shift(Guid.NewGuid(), proposed.AddDays(1), proposed.AddDays(1).AddHours(2));
        Assert.False(regime.CanWork(proposed, proposed.AddHours(2), [future], rule));
        var noRest = rule with { WorkUnits = 7, RestUnits = 0 };
        Assert.Equal(Monday.AddDays(1).AddHours(10), regime.EstimateStartAfterRest(Monday.AddHours(10), noRest));
        Assert.True(regime.CanWork(Monday.AddHours(11), Monday.AddHours(13), [], noRest));
    }

    [Fact]
    public void RegimeAloneDoesNotApplyCompanyRest()
    {
        var request = Request();
        var employee = request.Document.Employees[0];
        var previous = Shift(employee.Id, Monday.AddDays(-1).AddHours(19), Monday);
        var candidate = Shift(employee.Id, Monday.AddHours(8), Monday.AddHours(10));
        var rule = employee.Workload with { RegimeType = "hourBased", RestUnits = 1 };
        Assert.True(new HourBasedRegime().CanWork(candidate.Start, candidate.End, [previous], rule));
        var document = request.Document with { Company = request.Document.Company with { DefaultWorkload = rule }, Assignments = [previous, candidate] };
        Assert.Contains(ScheduleRules.Diagnose(document, document.Assignments), c => c.Code == "minimumRest");
    }

    private static ScheduleRequest Request()
    {
        var rule = new WorkloadRule("dayBased", 7, 0, 44, TimeSpan.FromHours(2));
        var employee = new Employee(Guid.NewGuid(), "Pessoa", "A", true, rule, [], [], [], false, true, []);
        var company = new CompanyRules("Loja", new(0, 0), new(0, 0), Enum.GetValues<DayOfWeek>(), rule,
            new(TimeSpan.Zero, TimeSpan.FromHours(2), TimeSpan.FromHours(1)), TimeSpan.FromHours(11),
            [new("Equipe", DayOfWeek.Monday, new(0, 0), new(2, 0), 2, Scope: "team")]);
        return new(new("1.0.0", Guid.NewGuid(), company, [employee], [], DateTimeOffset.UtcNow), Monday, Monday.AddDays(1).AddSeconds(-1));
    }

}
