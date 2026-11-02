using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Infrastructure.Solver;
using Google.OrTools.Sat;

namespace EscalaLivre.Adapter.Tests;

// Baseline only: these expectations must change explicitly when contracted workload is introduced.
public sealed class WeeklyWorkCharacterizationTests
{
    private static ScheduleRequest Request(double ceiling = 44, double daily = 8, bool overtime = false,
        bool oneHour = false, MiddayClosure? closure = null, MiddayClosure? individual = null)
    {
        var work = new WorkloadRule("dayBased", 5, 2, ceiling, TimeSpan.FromHours(daily));
        var days = Enumerable.Range(1, 5).Select(i => (DayOfWeek)i).ToArray();
        var company = new CompanyRules("Loja", new(7,30), new(17,30), days, work,
            new(TimeSpan.FromHours(1), TimeSpan.FromHours(oneHour ? 1 : 2), TimeSpan.FromHours(4)),
            TimeSpan.FromHours(11), days.Select(d => new CoverageRequirement("Equipe", d, new(7,30), new(17,30), 1)).ToArray(), closure);
        var person = new Employee(Guid.NewGuid(), "Pessoa", "Equipe", true, work, [], [], [], overtime, false, [],
            ShiftStartsAt: new(7,30), FixedInterval: individual);
        return new(new("1.0.0", Guid.NewGuid(), company, [person], [], new(2026,11,1,0,0,0,TimeSpan.Zero)),
            new(2026,11,9), new(2026,11,13));
    }

    [Fact]
    public void CeilingDoesNotLengthenCandidatesOrCreateAWeeklyTarget()
    {
        var r = Request();
        var candidates = new ScheduleCandidateGenerator().Generate(r).ToArray();
        Assert.NotEmpty(candidates);
        Assert.All(candidates, a => Assert.Equal(TimeSpan.FromHours(8), EffectiveWorkPolicy.Measure(a)));
        Assert.Contains(candidates, a => a.Break!.End - a.Break.Start == TimeSpan.FromHours(1));
        Assert.Contains(candidates, a => a.Break!.End - a.Break.Start == TimeSpan.FromHours(2));
        var result = AdapterComposition.Generate().Execute(r);
        Assert.Contains(result.Optimization!.Status, new[] { "optimal", "feasible" });
        Assert.Equal(5, result.Assignments.Count);
        Assert.Equal(40, result.Assignments.Sum(a => EffectiveWorkPolicy.Measure(a).TotalHours));
        Assert.Single(result.Assignments.Select(a => (a.Break!.Start.TimeOfDay, a.Break.End-a.Break.Start)).Distinct());
    }

    [Theory]
    [InlineData(40, true)]
    [InlineData(39.999, false)]
    public void WeeklyCeilingIsAnUpperBoundIncludingEquality(double ceiling, bool allowed)
    {
        var r = Request(ceiling);
        var shifts = new ScheduleCandidateGenerator().Generate(r).GroupBy(a => a.Start.Date).Select(g => g.First()).ToArray();
        Assert.Equal(5, shifts.Length);
        var budget = new OptimizationBudget();
        var context = AdapterComposition.Builder().Build(new(r, shifts, budget), budget);
        foreach (var a in shifts) context.Model.Add(context.DecisionVars[a.Id] == 1);
        var status = new OrToolsExecution().Solve(context.Model).Status;
        Assert.Equal(allowed, status is CpSolverStatus.Optimal or CpSolverStatus.Feasible);
    }

    [Theory]
    [InlineData(8, false, true)]
    [InlineData(8, true, true)]
    [InlineData(9, false, false)]
    [InlineData(9, true, true)]
    public void OvertimeRaisesDailyPermissionButDoesNotExtendDefaultDuration(double daily, bool overtime, bool exists)
    {
        var r = Request(daily: daily, overtime: overtime, oneHour: true);
        var candidates = new ScheduleCandidateGenerator().Generate(r).ToArray();
        Assert.Equal(exists, candidates.Length > 0);
        Assert.All(candidates, a => Assert.Equal(TimeSpan.FromHours(daily), EffectiveWorkPolicy.Measure(a)));
        Assert.Equal(TimeSpan.FromHours(overtime ? 10 : 8), EffectiveWorkPolicy.DailyLimit(r.Document.Employees[0]));
    }

    [Theory]
    [InlineData(false, false, 60)]
    [InlineData(true, false, 120)]
    [InlineData(false, true, 90)]
    public void EqualOneHourLimitsFixVariableDurationExceptClosureAndIndividual(bool closure, bool individual, int minutes)
    {
        var r = Request(oneHour: true, closure: closure ? new(new(12,0),new(14,0)) : null,
            individual: individual ? new(new(11,30),new(13,0)) : null);
        var candidates = new ScheduleCandidateGenerator().Generate(r).ToArray();
        Assert.NotEmpty(candidates);
        Assert.All(candidates, a => Assert.Equal(TimeSpan.FromMinutes(minutes), a.Break!.End-a.Break.Start));
    }
}
