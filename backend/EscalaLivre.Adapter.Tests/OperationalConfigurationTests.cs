using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Domain.Planning;
using EscalaLivre.Infrastructure.Solver;
using Google.OrTools.Sat;

namespace EscalaLivre.Adapter.Tests;

public sealed class OperationalConfigurationTests
{
    private static readonly DateTime Monday = new(2026, 10, 19);

    [Theory]
    [InlineData(double.NaN)]
    [InlineData(double.PositiveInfinity)]
    [InlineData(-1)]
    public void CandidateGenerationRequiresAValidatedConfigurationEvenWithoutHttp(double weeklyHours)
    {
        var rule = new WorkloadRule("dayBased", 5, 2, weeklyHours, TimeSpan.FromHours(2));
        var employee = new Employee(Guid.NewGuid(), "A", "A", true, rule, [], [], [], false, true, []);
        var company = new CompanyRules("Loja", new(8, 0), new(10, 0), [DayOfWeek.Monday], rule,
            new(TimeSpan.Zero, TimeSpan.FromHours(2), TimeSpan.FromHours(1)), TimeSpan.FromHours(11), []);
        var request = new ScheduleRequest(new("1.0.0", Guid.NewGuid(), company, [employee], [], DateTimeOffset.UtcNow),
            new(2026, 10, 19), new(2026, 10, 19, 23, 59, 59));
        Assert.Throws<ArgumentOutOfRangeException>(() => new ScheduleCandidateGenerator().Generate(request).ToArray());
        Assert.Throws<ArgumentOutOfRangeException>(() => new ScheduleModelInput(request, [], new()));
    }

    private static ScheduleRequest Request(WorkloadRule personal, bool inherits = false)
    {
        var defaults = new WorkloadRule("dayBased", 7, 0, 44, TimeSpan.FromHours(4));
        var employee = new Employee(Guid.NewGuid(), "A", "A", inherits, personal, [], [], [], false, true, [], ShiftStartsAt: new(8, 0, 1));
        var company = new CompanyRules("Loja", new(0, 0), new(0, 0), Enum.GetValues<DayOfWeek>(), defaults,
            new(TimeSpan.Zero, TimeSpan.FromHours(2), TimeSpan.FromHours(1)), TimeSpan.FromHours(11), []);
        return new(new("1.0.0", Guid.NewGuid(), company, [employee], [], DateTimeOffset.UtcNow), Monday, Monday.AddDays(1).AddSeconds(-1));
    }

    private static ShiftAssignment Shift(ScheduleRequest request, DateTime start, TimeSpan work)
        => new(Guid.NewGuid(), request.Document.Employees[0].Id, "A", start, start.Add(work), null, "solver", []);

    private static CpSolverStatus Force(ScheduleRequest request, ShiftAssignment candidate)
    {
        var budget = new OptimizationBudget();
        var input = new ScheduleModelInput(request, [candidate], budget);
        var context = AdapterComposition.Builder().Build(input, budget);
        context.Model.Add(context.DecisionVars[candidate.Id] == 1);
        return new OrToolsExecution().Solve(context.Model).Status;
    }

    [Theory]
    [InlineData(false, 0, true)]
    [InlineData(false, 1, false)]
    [InlineData(true, 1, true)]
    public void NativeWeeklyBudgetUsesEffectiveFractionalHoursAndSecondPrecision(bool inherits, int extraSeconds, bool feasible)
    {
        var request = Request(new("hourBased", 2, 13, 1.25, TimeSpan.FromHours(2)), inherits);
        var candidate = Shift(request, Monday.AddHours(8).AddSeconds(1), TimeSpan.FromMinutes(75).Add(TimeSpan.FromSeconds(extraSeconds)));
        var status = Force(request, candidate);
        Assert.Equal(feasible, status is CpSolverStatus.Optimal or CpSolverStatus.Feasible);
        if (!feasible) Assert.Equal(CpSolverStatus.Infeasible, status);
    }

    [Theory]
    [InlineData(-1, false)]
    [InlineData(0, true)]
    public void NativeRestUsesPersonalHoursAtThePreservedBoundary(int seconds, bool feasible)
    {
        var request = Request(new("hourBased", 2, 13, 44, TimeSpan.FromHours(2)));
        var history = Shift(request, Monday.AddDays(-1).AddHours(22).AddSeconds(1), TimeSpan.FromHours(2));
        request = request with { Document = request.Document with { Assignments = [history] } };
        var candidate = Shift(request, Monday.AddHours(13).AddSeconds(1 + seconds), TimeSpan.FromHours(2));
        var status = Force(request, candidate);
        Assert.Equal(feasible, status is CpSolverStatus.Optimal or CpSolverStatus.Feasible);
        if (!feasible) Assert.Equal(CpSolverStatus.Infeasible, status);
    }

    [Fact]
    public void GeneratorReadsPersonalValidatedDurationWithoutChangingCivilSeconds()
    {
        var request = Request(new("hourBased", 2, 13, 43.75, TimeSpan.FromHours(2)));
        var candidates = new ScheduleCandidateGenerator().Generate(request).ToArray();
        Assert.NotEmpty(candidates);
        Assert.All(candidates, candidate =>
        {
            Assert.Equal(1, candidate.Start.Second);
            Assert.Equal(1, candidate.End.Second);
            Assert.Equal(TimeSpan.FromHours(2), EffectiveWorkPolicy.Measure(candidate));
            Assert.Equal(DateTimeKind.Unspecified, candidate.Start.Kind);
        });
    }

    [Fact]
    public void ModelKeepsTypedSettingsAndReadProjectionConsistentAfterCallerMutation()
    {
        var request = Request(new("hourBased", 2, 13, 43.75, TimeSpan.FromHours(2)));
        var employees = request.Document.Employees.ToList();
        var coverage = new List<CoverageRequirement> { new("A", DayOfWeek.Monday, new(8, 0), new(10, 0), 1) };
        request = request with { Document = request.Document with { Employees = employees, Company = request.Document.Company with { Coverage = coverage } } };
        var input = new ScheduleModelInput(request, [], new());
        employees.Clear(); coverage.Clear();
        var employee = Assert.Single(input.Request.Document.Employees);
        Assert.Single(input.Request.Document.Company.Coverage);
        Assert.Equal(43.75, Assert.IsType<HourCycleConfiguration>(input.Settings.RegimeFor(employee.Id)).WeeklyLimit.Value);
        Assert.Throws<NotSupportedException>(() => ((IList<Employee>)input.Request.Document.Employees).Clear());
    }
}
