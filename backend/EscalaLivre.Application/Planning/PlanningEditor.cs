using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Scheduling;
using EscalaLivre.Application.Validation;
using EscalaLivre.Domain.Planning;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Application.Planning;

public sealed record PlanningEditResult(EscalaLivreDocument Document, ScheduleResult Analysis);

// Explicit application commands. They do not add HTTP endpoints or silently repair business conflicts.
public sealed class PlanningEditor(IScheduleAnalyzer analyzer)
{
    private PlanningEditResult Edit(ScheduleRequest request, Action<PlanningDocumentMapping> command, DateTimeOffset updatedAt, bool writePeriod = false)
    {
        var mapping = PlanningDocumentMapping.Open(request);
        command(mapping);
        var document = mapping.ToDocument(writePeriod) with { UpdatedAt = updatedAt.ToUniversalTime() };
        if (DocumentSafety.Error(document) is { } error) throw new FormatException(error);
        var period = mapping.Schedule.Period;
        var analysis = analyzer.Analyze(new(document, period.Start.ToDateTime(TimeOnly.MinValue), period.End.ToDateTime(new(23,59,59))));
        return new(document, analysis);
    }

    public PlanningEditResult Assign(ScheduleRequest request, ShiftAssignment assignment, DateTimeOffset updatedAt)
        => Edit(request, m => m.Schedule.Assign(m.ImportAssignment(assignment)), updatedAt);

    public PlanningEditResult Update(ScheduleRequest request, Guid id, ShiftAssignment replacement, DateTimeOffset updatedAt)
        => Edit(request, m => m.Schedule.Update(id, m.ImportAssignment(replacement)), updatedAt);

    public PlanningEditResult Remove(ScheduleRequest request, Guid id, DateTimeOffset updatedAt)
        => Edit(request, m => m.Schedule.Remove(id), updatedAt);

    public PlanningEditResult Move(ScheduleRequest request, Guid id, CivilWindow target, DateTimeOffset updatedAt)
        => Edit(request, m => m.Schedule.Move(id, target), updatedAt);

    public PlanningEditResult ReplacePeriod(ScheduleRequest request, IReadOnlyList<ShiftAssignment> replacements, DateTimeOffset updatedAt)
        => Edit(request, m => m.Schedule.ReplacePeriod(replacements.Select(m.ImportAssignment)), updatedAt);

    public PlanningEditResult ChangePeriod(ScheduleRequest request, CivilPlanningPeriod period, DateTimeOffset updatedAt)
        => Edit(request, m => m.Schedule.ChangePeriod(period), updatedAt, writePeriod: true);

    public PlanningEditResult ChangeCompany(ScheduleRequest request, CompanyRules company, DateTimeOffset updatedAt)
        => Edit(request, m => m.ChangeCompany(company), updatedAt);

    public PlanningEditResult ChangeEmployee(ScheduleRequest request, Guid id, Employee employee, DateTimeOffset updatedAt)
        => Edit(request, m => m.ChangeEmployee(id, employee), updatedAt);
}
