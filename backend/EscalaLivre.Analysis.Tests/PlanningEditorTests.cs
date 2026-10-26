using System.Text.Json;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Planning;
using EscalaLivre.Application.Scheduling;
using EscalaLivre.Domain.Planning;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Analysis.Tests;

public sealed class PlanningEditorTests
{
    private static PlanningEditor Editor() => new(new ScheduleAnalyzer(new ScheduleEvaluator()));
    private static DateTimeOffset Updated => new(2026,10,26,12,0,0,TimeSpan.Zero);
    private static string Hours(EscalaLivreDocument document) => JsonSerializer.Serialize(document.Assignments.Select(a => new { a.Id, a.Start, a.End, a.Break, a.Source, a.Tags }));

    [Fact]
    public void CompanyChangesReevaluateConflictsWithoutRepairingSavedHours()
    {
        var request = AnalysisContractTests.Request();
        var before = Hours(request.Document);
        var company = request.Document.Company with { DefaultWorkload = request.Document.Company.DefaultWorkload with { DefaultShiftDuration = TimeSpan.FromHours(4) } };
        var edited = Editor().ChangeCompany(request, company, Updated);
        Assert.Equal(before, Hours(edited.Document));
        Assert.Equal(before, Hours(request.Document));
        Assert.Contains(edited.Analysis.Conflicts, c => c.Code == "workload");
        Assert.Equal(Updated, edited.Document.UpdatedAt);
    }

    [Fact]
    public void StructurallyValidConflictingShiftsRemainEditableAndDiagnostic()
    {
        var request = AnalysisContractTests.Request(); var original = request.Document.Assignments.Single();
        var added = original with { Id = Guid.NewGuid(), Start = original.Start.AddHours(1), End = original.End.AddHours(4), Break = null };
        var assigned = Editor().Assign(request, added, Updated);
        Assert.Contains(assigned.Analysis.Conflicts, c => c.Code == "minimumRest");
        Assert.Contains(assigned.Analysis.Conflicts, c => c.Code == "workload");
        Assert.Contains(assigned.Analysis.Conflicts, c => c.Code == "interval");
        Assert.Equal(added.End, assigned.Document.Assignments.Single(a => a.Id == added.Id).End);
        var replaced = added with { End = added.Start.AddHours(1) };
        var updated = Editor().Update(request with { Document = assigned.Document }, added.Id, replaced, Updated);
        Assert.Equal(replaced.End, updated.Document.Assignments.Single(a => a.Id == added.Id).End);
        var removed = Editor().Remove(request with { Document = updated.Document }, added.Id, Updated);
        Assert.Equal(Hours(request.Document), Hours(removed.Document));
        Assert.Single(request.Document.Assignments);
    }

    [Fact]
    public void EmployeeEditExplicitlyUpdatesRolesInAllHistoryAndPreservesTimes()
    {
        var request = AnalysisContractTests.Request(); var current = request.Document.Assignments.Single();
        var before = current with { Id = Guid.NewGuid(), Start = current.Start.AddDays(-7), End = current.End.AddDays(-7), Break = null };
        var after = current with { Id = Guid.NewGuid(), Start = current.Start.AddDays(7), End = current.End.AddDays(7), Break = null };
        request = request with { Document = request.Document with { Assignments = [before, current, after] } };
        var roleId = Guid.NewGuid();
        var employee = request.Document.Employees[0] with { Role = "Changed", RoleId = roleId, Name = "Edited" };
        var result = Editor().ChangeEmployee(request, employee.Id, employee, Updated);
        Assert.Equal(Hours(request.Document), Hours(result.Document));
        Assert.All(result.Document.Assignments, a => { Assert.Equal("Changed", a.Role); Assert.Equal(roleId, a.RoleId); });
        Assert.All(request.Document.Assignments, a => Assert.Equal(current.Role, a.Role));
    }

    [Fact]
    public void ChangingPeriodKeepsTheCompleteDocumentAndUpdatesExplicitPeriod()
    {
        var request = AnalysisContractTests.Request();
        var target = new CivilPlanningPeriod(new(2026,10,20), new(2026,10,21));
        var result = Editor().ChangePeriod(request, target, Updated);
        Assert.Equal(Hours(request.Document), Hours(result.Document));
        Assert.Equal(new PlanningPeriod(target.Start, target.End), result.Document.PlanningPeriod);
        Assert.Equal(request.Document.Id, result.Document.Id);
        Assert.Equal(request.Document.SchemaVersion, result.Document.SchemaVersion);
        var mapping = PlanningDocumentMapping.Open(request);
        mapping.Schedule.ChangePeriod(target);
        Assert.Equal(result.Document.PlanningPeriod, mapping.ToDocument().PlanningPeriod);
    }

    [Fact]
    public void InvalidCommandDoesNotMutateTheInputAndMoveDoesNotFixBusinessRules()
    {
        var request = AnalysisContractTests.Request(); var shift = request.Document.Assignments.Single();
        var before = JsonSerializer.Serialize(request.Document, ScheduleJson.CreateOptions());
        Assert.Throws<ArgumentException>(() => Editor().Update(request, shift.Id, shift with { Id = Guid.NewGuid() }, Updated));
        Assert.Equal(before, JsonSerializer.Serialize(request.Document, ScheduleJson.CreateOptions()));
        var result = Editor().Move(request, shift.Id, new(shift.Start.AddSeconds(1), shift.End.AddSeconds(1)), Updated);
        Assert.Equal(shift.Break!.Start.AddSeconds(1), result.Document.Assignments[0].Break!.Start);
        Assert.Contains(result.Analysis.Conflicts, c => c.Code == "availability");
    }
}
