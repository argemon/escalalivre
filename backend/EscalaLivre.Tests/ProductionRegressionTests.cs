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
    public void CustomDaysRestrictGenerationAndInheritedDaysFollowCompany()
    {
        var request = Request();
        var employee = request.Document.Employees[0] with { InheritsCompanyDefaults = false, WorkingDays = [DayOfWeek.Tuesday] };
        request = request with { Document = request.Document with { Employees = [employee] } };
        var solver = new OrToolsScheduleSolver();
        var custom = solver.Solve(request);
        Assert.Single(custom.Assignments);
        Assert.All(custom.Assignments, a => Assert.Equal(DayOfWeek.Tuesday, a.Start.DayOfWeek));
        request = request with { Document = request.Document with { Employees = [employee with { InheritsCompanyDefaults = true }] } };
        Assert.Equal(2, solver.Solve(request).Assignments.Count);
    }

    [Fact]
    public void RecognizedClosingPreferenceChangesShiftSelection()
    {
        var request = Request();
        request = request with { Document = request.Document with {
            Company = request.Document.Company with { Coverage = [new("nurse", DayOfWeek.Monday, new(10, 0), new(12, 0), 1)] },
            Employees = [request.Document.Employees[0] with { Preferences = [new("closing", 10, "Fechar")] }]
        } };
        var result = new OrToolsScheduleSolver().Solve(request);
        Assert.Single(result.Assignments);
        Assert.Equal(18, result.Assignments[0].End.Hour);
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
    public void MissingCoverageProducesPartialSchedule()
    {
        var result = new OrToolsScheduleSolver().Solve(Request(required: 2));
        Assert.Equal(2, result.Assignments.Count);
        Assert.NotEmpty(result.Gaps);
        Assert.Empty(result.Conflicts);
    }

    [Fact]
    public void RestBetweenNewShiftsIsMandatory()
    {
        var result = new OrToolsScheduleSolver().Solve(Request(rest: 20));
        Assert.Single(result.Assignments);
        Assert.NotEmpty(result.Gaps);
        Assert.Empty(result.Conflicts);
    }

    [Fact]
    public void CanCoverClosingWithLaterShiftStart()
    {
        var request = Request();
        request = request with { Document = request.Document with { Company = request.Document.Company with {
            Coverage = [new("nurse", DayOfWeek.Monday, new(16, 0), new(18, 0), 1)]
        } } };
        var result = new OrToolsScheduleSolver().Solve(request);
        Assert.Empty(result.Gaps);
        Assert.Empty(result.Conflicts);
        Assert.Single(result.Assignments);
        Assert.Equal(new DateTime(2026, 5, 18, 18, 0, 0), result.Assignments[0].End);
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
