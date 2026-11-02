using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Infrastructure.Solver;
using Google.OrTools.Sat;

namespace EscalaLivre.Adapter.Tests;

public sealed class WeeklyIntervalTests
{
    private static readonly DateTime Monday = new(2026, 11, 9);
    private static ScheduleRequest Request()
    {
        var work = new WorkloadRule("dayBased", 5, 2, 44, TimeSpan.FromHours(8));
        var people = new[] { "A", "B" }.Select(name => new Employee(Guid.NewGuid(), name, "Equipe", true,
            work, [], [], [], false, false, [], ShiftStartsAt: new(7, 30))).ToArray();
        var coverage = Enumerable.Range(1, 5).Select(day => new CoverageRequirement("Equipe", (DayOfWeek)day,
            new(7, 30), new(16, 30), 1)).ToArray();
        var company = new CompanyRules("Loja", new(7, 30), new(16, 30), coverage.Select(c => c.Day).ToArray(),
            work, new(TimeSpan.FromHours(1), TimeSpan.FromHours(1), TimeSpan.FromHours(4)), TimeSpan.FromHours(11), coverage);
        return new(new("1.0.0", Guid.NewGuid(), company, people, [], DateTimeOffset.UtcNow), Monday, Monday.AddDays(4));
    }
    private static ShiftAssignment Shift(ScheduleRequest r, int day, int hour, int minutes = 0, int duration = 60)
    {
        var date = Monday.AddDays(day);
        return new(Guid.NewGuid(), r.Document.Employees[0].Id, "Equipe", date.AddHours(7.5), date.AddHours(16.5),
            new(date.AddHours(hour).AddMinutes(minutes), date.AddHours(hour).AddMinutes(minutes + duration)), "solver", []);
    }
    private static CpSolverStatus Force(ScheduleRequest r, params ShiftAssignment[] shifts)
    {
        var budget = new OptimizationBudget();
        var context = AdapterComposition.Builder().Build(new(r, shifts, budget), budget);
        foreach (var shift in shifts) context.Model.Add(context.DecisionVars[shift.Id] == 1);
        return new OrToolsExecution().Solve(context.Model).Status;
    }

    [Theory]
    [InlineData(11, 0, 60, true)]
    [InlineData(12, 0, 60, false)]
    [InlineData(11, 1, 60, false)]
    [InlineData(11, 0, 61, false)]
    public void SameEmployeeKeepsStartAndDurationWithinWeek(int hour, int minute, int duration, bool allowed)
    {
        var r = Request();
        var status = Force(r, Shift(r, 0, 11), Shift(r, 1, hour, minute, duration));
        Assert.Equal(allowed, status is CpSolverStatus.Optimal or CpSolverStatus.Feasible);
    }

    [Fact]
    public void DifferentEmployeesMayStaggerTheirLunch()
    {
        var r = Request();
        var a = Shift(r, 0, 11);
        var b = Shift(r, 0, 12) with { EmployeeId = r.Document.Employees[1].Id };
        Assert.Equal(CpSolverStatus.Optimal, Force(r, a, b));
    }

    [Fact]
    public void SundayStartsANewRoutineWeek()
    {
        var r = Request() with { End = Monday.AddDays(7) };
        Assert.Equal(CpSolverStatus.Optimal, Force(r, Shift(r, 5, 11), Shift(r, 6, 12)));
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(4)]
    public void PreservedLunchAnchorsPartialWeekAtBothEdges(int day)
    {
        var r = Request() with { End = Monday.AddDays(3) };
        var history = Shift(r, day, 11);
        r = r with { Document = r.Document with { Assignments = [history] } };
        Assert.Equal(CpSolverStatus.Infeasible, Force(r, Shift(r, 1, 12)));
        Assert.Equal(CpSolverStatus.Optimal, Force(r, Shift(r, 1, 11)));
        Assert.Same(history, Assert.Single(r.Document.Assignments));
    }

    [Fact]
    public void ConflictingHistoricalRoutinesRemainUntouchedAndCannotBeExtended()
    {
        var r = Request() with { Start = Monday.AddDays(1), End = Monday.AddDays(3) };
        var before = Shift(r, 0, 11); var after = Shift(r, 4, 12);
        r = r with { Document = r.Document with { Assignments = [before, after] } };
        Assert.Equal(CpSolverStatus.Infeasible, Force(r, Shift(r, 1, 11)));
        Assert.Equal(CpSolverStatus.Infeasible, Force(r, Shift(r, 1, 12)));
        Assert.Same(before, r.Document.Assignments[0]);
        Assert.Same(after, r.Document.Assignments[1]);
    }

    [Fact]
    public void LunchesRespectConfiguredDelayWhenFullCoverageIsPossible()
    {
        var r = Request();
        var result = AdapterComposition.Generate().Execute(r);
        Assert.Equal(1, result.CoverageScore);
        Assert.NotEmpty(result.Assignments);
        Assert.All(result.Assignments, a => Assert.False(IntervalTimingPolicy.IsEarly(r.Document.Company, a)));
    }

    [Fact]
    public void EarlierLunchIsAllowedOnlyWithMeasuredCoverageImprovement()
    {
        var r = Request() with { End = Monday };
        var company = r.Document.Company with { Coverage = [new("Equipe", DayOfWeek.Monday, new(11, 30), new(16, 30), 1)] };
        r = r with { Document = r.Document with { Company = company, Employees = [r.Document.Employees[0]] } };
        var result = AdapterComposition.Generate().Execute(r);
        Assert.Equal(1, result.CoverageScore);
        var shift = Assert.Single(result.Assignments);
        Assert.True(IntervalTimingPolicy.IsEarly(company, shift));
        Assert.True(IntervalTimingPolicy.HasWorkAroundPause(shift));
        Assert.Contains("interval-anticipated-for-coverage", shift.Tags);
        Assert.Contains(Assert.Single(result.Decisions).Factors, f => f.Contains("antecipado"));
    }

    [Fact]
    public void EqualPartialCoverageDoesNotJustifyAnticipation()
    {
        var r = Request() with { End = Monday };
        r = r with { Document = r.Document with { Employees = [r.Document.Employees[0]] } };
        var result = AdapterComposition.Generate().Execute(r);
        Assert.True(result.CoverageScore < 1);
        Assert.NotEmpty(result.Assignments);
        Assert.All(result.Assignments, a => Assert.False(IntervalTimingPolicy.IsEarly(r.Document.Company, a)));
    }

    [Theory]
    [InlineData(8, 29, false)]
    [InlineData(8, 30, true)]
    [InlineData(14, 30, true)]
    [InlineData(14, 31, false)]
    public void GenerationRequiresAnHourOfWorkAtEachSideOfLunch(int hour, int minute, bool allowed)
    {
        var r = Request();
        var status = Force(r, Shift(r, 0, hour, minute));
        Assert.Equal(allowed, status is CpSolverStatus.Optimal or CpSolverStatus.Feasible);
    }

    [Fact]
    public void ThirtyDayPlanKeepsTwoHourLunchesRegularAndCoverageComplete()
    {
        var r = Request();
        var company = r.Document.Company with
        {
            ClosesAt = new(17, 30), Lunch = new(TimeSpan.FromHours(2), TimeSpan.FromHours(2), TimeSpan.FromHours(4)),
            Coverage = r.Document.Company.Coverage.Select(c => c with { End = new(17, 30) }).ToArray()
        };
        r = r with { Start = new(2026, 11, 1), End = new(2026, 11, 30), Document = r.Document with { Company = company } };
        var result = AdapterComposition.Generate().Execute(r);
        Assert.Contains(result.Optimization!.Status, new[] { "optimal", "feasible" });
        Assert.Equal(1, result.CoverageScore);
        Assert.DoesNotContain(result.Conflicts, c => c.Severity == "error");
        Assert.NotEmpty(result.Assignments);
        foreach (var week in result.Assignments.GroupBy(a => (a.EmployeeId, Week: ScheduleWindow.WeekStart(a.Start))))
        {
            Assert.Single(week.Select(a => a.Break!.Start.TimeOfDay).Distinct());
            Assert.All(week, a => Assert.Equal(TimeSpan.FromHours(2), a.Break!.End - a.Break.Start));
        }
    }

    [Fact]
    public void RealGeneratorStaggersConsistentLunchesWithoutCoverageGaps()
    {
        var r = Request();
        var result = AdapterComposition.Generate().Execute(r);
        Assert.Contains(result.Optimization!.Status, new[] { "optimal", "feasible" });
        Assert.Equal(1, result.CoverageScore);
        Assert.DoesNotContain(result.Conflicts, c => c.Severity == "error");
        foreach (var employee in r.Document.Employees)
        {
            var shifts = result.Assignments.Where(a => a.EmployeeId == employee.Id).ToArray();
            Assert.Equal(5, shifts.Length);
            Assert.Single(shifts.Select(a => (a.Break!.Start.TimeOfDay, a.Break.End - a.Break.Start)).Distinct());
        }
        foreach (var day in result.Assignments.GroupBy(a => a.Start.Date))
        {
            var pauses = day.Select(a => a.Break!).OrderBy(p => p.Start).ToArray();
            Assert.True(pauses[0].End <= pauses[1].Start);
        }
    }
}
