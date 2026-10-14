using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Regimes;
using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Infrastructure.Solver;

namespace EscalaLivre.Tests;

public sealed class SetupRegressionTests
{
    private static ScheduleRequest Request(int days = 1, int workDays = 5, int restDays = 2, MiddayClosure? closure = null)
    {
        var rule = new WorkloadRule("dayBased", workDays, restDays, 44, TimeSpan.FromHours(8));
        var operating = Enum.GetValues<DayOfWeek>();
        var coverage = operating.Select(d => new CoverageRequirement("vendedor", d, new(7,30), new(17,30), 1)).ToArray();
        var company = new CompanyRules("Loja", new(7,30), new(17,30), operating, rule,
            new LunchRule(TimeSpan.FromHours(1), TimeSpan.FromHours(1), TimeSpan.FromHours(4)), TimeSpan.FromHours(11), coverage, closure);
        var employees = Enumerable.Range(0, 2).Select(i => new Employee(Guid.NewGuid(), $"Pessoa {i}", "vendedor", true, rule, [], [], [], false, false, [])).ToArray();
        var start = new DateTime(2026,10,14);
        return new(new("1.0.0", Guid.NewGuid(), company, employees, [], DateTimeOffset.UtcNow), start, start.AddDays(days).AddSeconds(-1));
    }

    [Fact]
    public void TwoEmployeesCover0730To1730WithOnePersonRequired()
    {
        var result = new OrToolsScheduleSolver().Solve(Request());
        Assert.Equal(2, result.Assignments.Count);
        Assert.Empty(result.Conflicts);
        Assert.Empty(result.Gaps);
        Assert.Contains(result.Assignments, a => a.Start.TimeOfDay == new TimeSpan(7,30,0));
        Assert.Contains(result.Assignments, a => a.End.TimeOfDay == new TimeSpan(17,30,0));
        Assert.All(result.Assignments, a => Assert.True(a.Start.TimeOfDay >= new TimeSpan(7,30,0)));
    }

    [Fact]
    public void DayCycleDoesNotUseAnArbitraryCalendarPhase()
    {
        var rule = new WorkloadRule("dayBased", 1, 1, 44, TimeSpan.FromHours(8));
        var regime = new DayBasedRegime();
        var start = new DateTime(2026,10,14,7,30,0);
        Assert.True(regime.CanWork(start,start.AddHours(8),[],rule));
        Assert.True(regime.CanWork(start.AddDays(1),start.AddDays(1).AddHours(8),[],rule));
        var result = new OrToolsScheduleSolver().Solve(Request(days: 4, workDays: 1, restDays: 1));
        Assert.NotEmpty(result.Assignments);
        foreach (var employee in result.Assignments.GroupBy(a => a.EmployeeId))
        {
            var dates = employee.Select(a => a.Start.Date).Order().ToArray();
            for (var i=1; i<dates.Length; i++) Assert.True((dates[i]-dates[i-1]).TotalDays >= 2);
        }
        Assert.Empty(result.Conflicts);
    }

    [Fact]
    public void ClosingForLunchRemovesDemandAndAlignsBreaks()
    {
        var result = new OrToolsScheduleSolver().Solve(Request(closure:new(new(12,0),new(13,0))));
        Assert.NotEmpty(result.Assignments);
        Assert.Empty(result.Gaps);
        Assert.Empty(result.Conflicts);
        Assert.DoesNotContain(result.Coverage,b => b.Start.Hour >= 12 && b.Start.Hour < 13);
        foreach (var a in result.Assignments.Where(a => a.Start.Hour < 12 && a.End.Hour > 13))
        {
            Assert.NotNull(a.Break);
            Assert.Equal(new TimeSpan(12,0,0),a.Break.Start.TimeOfDay);
            Assert.Equal(new TimeSpan(13,0,0),a.Break.End.TimeOfDay);
        }
    }
}
