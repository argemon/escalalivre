using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Planning;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Application.Scheduling;

public sealed class GenerateSchedule(IScheduleOptimizer optimizer, IScheduleAnalyzer analyzer)
{
    public ScheduleResult Execute(ScheduleRequest request)
    {
        var optimized = optimizer.Optimize(request);
        if (optimized.Status is not ("optimal" or "feasible"))
            return Failure(request, optimized.Status, optimized.Issues);

        IReadOnlyList<ShiftAssignment> assignments;
        try { assignments = PlanningDocumentMapping.ApplyGeneration(request, optimized.SelectedAssignments, optimized.Assignments); }
        catch (Exception error) when (error is ArgumentException or InvalidOperationException or FormatException)
        {
            return Failure(request, "invalid", [Invalid(request, "O resultado da geração não preserva a estrutura e o histórico do planejamento.")]);
        }
        var evaluated = analyzer.Analyze(request with { Document = request.Document with { Assignments = assignments } });
        var introduced = GenerationConformance.NewErrors(request.Document, assignments, evaluated.Conflicts);
        if (introduced.Count > 0)
            return Failure(request, "invalid", [Invalid(request, "A escala gerada introduz violações obrigatórias ("
                + string.Join(", ", introduced.Select(i => i.Code).Distinct().Order()) + "); os turnos anteriores foram preservados.")]);

        return evaluated with
        {
            Decisions = ScheduleExplanation.Describe(request.Document.Employees, optimized.SelectedAssignments).ToList(),
            Conflicts = evaluated.Conflicts.Concat(optimized.Issues).ToList(),
            Optimization = new(optimized.Status)
        };
    }

    private ScheduleResult Failure(ScheduleRequest request, string status, IReadOnlyList<ScheduleIssue> issues)
    {
        var original = analyzer.Analyze(request);
        return original with { Decisions = [], Conflicts = original.Conflicts.Concat(issues).ToList(), Optimization = new(status) };
    }

    private static ScheduleIssue Invalid(ScheduleRequest request, string message)
        => new("error", "solverInvalid", message, request.Start, request.End);
}
