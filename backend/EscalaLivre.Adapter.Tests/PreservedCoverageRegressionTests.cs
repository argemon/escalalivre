using System.Text.Json;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Regimes;
using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Infrastructure.Solver;

namespace EscalaLivre.Adapter.Tests;

// These tests record existing behavior, including known limitations. They do not approve it as a new rule.
public sealed class PreservedCoverageRegressionTests
{
    private static readonly DateTime Monday = new(2026, 10, 19);
    private static ShiftAssignment Shift(Guid employee, DateTime start, DateTime end)
        => new(Guid.NewGuid(), employee, "A", start, end, null, "manual", []);

    private static ScheduleRequest Request()
    {
        var rule = new WorkloadRule("dayBased", 7, 0, 44, TimeSpan.FromHours(2));
        var employee = new Employee(Guid.NewGuid(), "Pessoa", "A", true, rule, [], [], [], false, true, []);
        var company = new CompanyRules("Loja", new(0, 0), new(0, 0), Enum.GetValues<DayOfWeek>(), rule,
            new(TimeSpan.Zero, TimeSpan.FromHours(2), TimeSpan.FromHours(1)), TimeSpan.FromHours(11),
            [new("Equipe", DayOfWeek.Monday, new(0, 0), new(2, 0), 2, Scope: "team")]);
        return new(new("1.0.0", Guid.NewGuid(), company, [employee], [], DateTimeOffset.UtcNow), Monday, Monday.AddDays(1).AddSeconds(-1));
    }

    [Fact]
    public void SolverCountsDistinctPeopleWithoutChangingOverlappingPreservedAssignments()
    {
        var request = Request();
        var employee = request.Document.Employees[0];
        var available = employee with { Id = Guid.NewGuid(), Name = "Disponível", ShiftStartsAt = new(0, 0) };
        var original = new[] {
            Shift(employee.Id, Monday.AddDays(-1).AddHours(22), Monday.AddHours(2)),
            Shift(employee.Id, Monday.AddDays(-1).AddHours(23), Monday.AddHours(2))
        };
        request = request with { Document = request.Document with { Employees = [employee, available], Assignments = original } };
        var generation = AdapterComposition.Generate();
        var result = generation.Execute(request);
        Assert.All(original, shift => Assert.Same(shift, Assert.Single(result.Assignments, a => a.Id == shift.Id)));
        Assert.Contains(result.Assignments, a => a.EmployeeId == available.Id);
        Assert.Contains(result.Conflicts, c => c.Code == "multipleShifts");
        Assert.Empty(result.Gaps);
        Assert.Equal(1, result.CoverageScore);
    }
}
