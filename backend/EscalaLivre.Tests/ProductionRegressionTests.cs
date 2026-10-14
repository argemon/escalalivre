using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Infrastructure.Solver;

namespace EscalaLivre.Tests;

public sealed class ProductionRegressionTests
{
    private static ScheduleRequest Request(int employees = 1, int required = 1, double rest = 11)
    {
        var rule = new WorkloadRule("dayBased", 7, 0, 44, TimeSpan.FromHours(8));
        var company = new CompanyRules("Test", new(8, 0), new(18, 0), [DayOfWeek.Monday, DayOfWeek.Tuesday], rule,
            new LunchRule(TimeSpan.Zero, TimeSpan.Zero, TimeSpan.Zero), TimeSpan.FromHours(rest),
            [new("nurse", DayOfWeek.Monday, new(8, 0), new(10, 0), required), new("nurse", DayOfWeek.Tuesday, new(8, 0), new(10, 0), required)]);
        var staff = Enumerable.Range(0, employees).Select(i => new Employee(Guid.NewGuid(), $"Person {i}", "nurse", true, rule, [], [], [], false, false, [])).ToList();
        return new(new EscalaLivreDocument("1.0.0", Guid.NewGuid(), company, staff, [], DateTimeOffset.UtcNow), new(2026, 5, 18), new(2026, 5, 19, 23, 59, 59));
    }

    [Fact]
    public void DoesNotAssignUnneededEmployees()
    {
        var result = new OrToolsScheduleSolver().Solve(Request(employees: 3));
        Assert.Equal(2, result.Assignments.Count);
        Assert.Empty(result.Gaps);
        Assert.Empty(result.Conflicts);
    }

    [Fact]
    public void MissingCoverageIsInfeasible()
    {
        var result = new OrToolsScheduleSolver().Solve(Request(required: 2));
        Assert.Empty(result.Assignments);
        Assert.Contains(result.Conflicts, issue => issue.Code == "solverInfeasible");
    }

    [Fact]
    public void RestBetweenNewShiftsIsMandatory()
    {
        var result = new OrToolsScheduleSolver().Solve(Request(rest: 20));
        Assert.Contains(result.Conflicts, issue => issue.Code == "solverInfeasible");
    }

    [Fact]
    public void ExistingScheduleDoesNotBlockRegeneration()
    {
        var solver = new OrToolsScheduleSolver();
        var request = Request();
        var first = solver.Solve(request);
        var second = solver.Solve(request with { Document = request.Document with { Assignments = first.Assignments } });
        Assert.Empty(second.Conflicts);
        Assert.Equal(first.Assignments.Count, second.Assignments.Count);
    }
}
