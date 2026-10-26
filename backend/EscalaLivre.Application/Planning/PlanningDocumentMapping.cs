using System.Collections.Immutable;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Validation;
using EscalaLivre.Domain.Planning;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Application.Planning;

// Keeps the portable envelope outside the aggregate. No migration or time normalization occurs here.
public sealed class PlanningDocumentMapping
{
    private readonly EscalaLivreDocument template;
    private readonly CivilPlanningPeriod initialPeriod;
    public PlanningSchedule Schedule { get; }
    public PlanningSettings Settings { get; private set; }

    private PlanningDocumentMapping(EscalaLivreDocument document, CivilPlanningPeriod period)
    {
        if (DocumentSafety.Error(document) is { } error) throw new FormatException(error);
        if (document.PlanningPeriod is { } declared && (declared.Start != period.Start || declared.End != period.End))
            throw new FormatException("Planning context must match the document period.");
        initialPeriod = period;
        template = document with { Roles = document.Roles is null ? null : document.Roles.ToImmutableArray() };
        Settings = new(document.Company, document.Employees);
        Schedule = new(document.Id, period, Settings.Employees.Select(e => e.Id), document.Assignments.Select(ImportAssignment));
    }

    public static PlanningDocumentMapping Open(ScheduleRequest request)
        => new(request.Document, new(DateOnly.FromDateTime(request.Start), DateOnly.FromDateTime(request.End)));

    public ScheduledAssignment ImportAssignment(ShiftAssignment assignment)
    {
        ArgumentNullException.ThrowIfNull(assignment);
        var pause = assignment.Break is null ? null : new ShiftPause(new(assignment.Break.Start, assignment.Break.End));
        var value = new ScheduledAssignment(assignment.Id, assignment.EmployeeId, assignment.Role,
            new(assignment.Start, assignment.End), pause, assignment.Source, assignment.Tags, assignment.RoleId);
        return value;
    }

    public ShiftAssignment ExportAssignment(ScheduledAssignment assignment)
    {
        return new(assignment.Id, assignment.EmployeeId, assignment.Role, assignment.Window.Start, assignment.Window.End,
            assignment.Pause is null ? null : new(assignment.Pause.Window.Start, assignment.Pause.Window.End),
            assignment.Source, assignment.Tags, assignment.RoleId);
    }

    public EscalaLivreDocument ToDocument(bool writePeriod = false)
        => template with
        {
            Company = Settings.Company, Employees = Settings.Employees,
            Assignments = Schedule.Assignments.Select(ExportAssignment).ToImmutableArray(),
            PlanningPeriod = writePeriod || template.PlanningPeriod is not null || Schedule.Period != initialPeriod
                ? new(Schedule.Period.Start, Schedule.Period.End) : null
        };

    public void ChangeCompany(CompanyRules company)
    {
        if (DocumentSafety.Error(ToDocument() with { Company = company }) is { } error) throw new FormatException(error);
        Settings = Settings.WithCompany(company);
    }

    public void ChangeEmployee(Guid id, Employee employee)
    {
        if (DocumentSafety.Error(ToDocument() with { Employees = Settings.Employees.Select(e => e.Id == id ? employee : e).ToArray() }) is { } error)
            throw new FormatException(error);
        var updated = Settings.WithEmployee(id, employee);
        Schedule.ChangeEmployeeRole(id, employee.Role, employee.RoleId);
        Settings = updated;
    }

    public static IReadOnlyList<ShiftAssignment> ApplyGeneration(ScheduleRequest request, IReadOnlyList<ShiftAssignment> selected,
        IReadOnlyList<ShiftAssignment> proposed)
    {
        var mapping = Open(request);
        mapping.Schedule.ReplacePeriod(selected.Select(mapping.ImportAssignment));
        var applied = mapping.Schedule.Assignments.Select(mapping.ExportAssignment).ToImmutableArray();
        // The optimizer must not add/remove/rewrite history outside the period.
        if (applied.Length != proposed.Count || !applied.Zip(proposed).All(pair => Same(pair.First, pair.Second)))
            throw new InvalidOperationException("Optimization result does not preserve the requested planning boundary.");
        // Only the protected aggregate's export leaves this boundary. An adapter-owned collection or tags
        // must not be able to change the accepted result after validation.
        return applied;
    }

    private static bool Same(ShiftAssignment a, ShiftAssignment b)
        => a.Id == b.Id && a.EmployeeId == b.EmployeeId && a.Role == b.Role && a.RoleId == b.RoleId
            && a.Start.ToBinary() == b.Start.ToBinary() && a.End.ToBinary() == b.End.ToBinary()
            && SamePause(a.Break, b.Break) && a.Source == b.Source && a.Tags.SequenceEqual(b.Tags);

    private static bool SamePause(BreakWindow? a, BreakWindow? b)
        => a is null ? b is null : b is not null && a.Start.ToBinary() == b.Start.ToBinary() && a.End.ToBinary() == b.End.ToBinary();
}
