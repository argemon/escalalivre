using System.Collections.Immutable;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Planning;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Application.Scheduling;

public sealed class GenerateSchedule(IScheduleOptimizer optimizer, IScheduleAnalyzer analyzer)
{
    public ScheduleResult Execute(ScheduleRequest request)
    {
        var configuration = ContractMinimumPolicy.ConfigurationIssues(request.Document,request.Start,request.End);
        if(configuration.Count > 0) return Failure(request,"infeasible",configuration);
        var optimized = optimizer.Optimize(request);
        if (optimized.Status is not ("optimal" or "feasible"))
            return Failure(request, optimized.Status, optimized.Issues);

        IReadOnlyList<ShiftAssignment> assignments;
        IReadOnlyList<ShiftAssignment> selected;
        try
        {
            var selectedIds = optimized.SelectedAssignments.Select(a => a.Id).ToImmutableHashSet();
            assignments = PlanningDocumentMapping.ApplyGeneration(request, optimized.SelectedAssignments, optimized.Assignments);
            selected = assignments.Where(a => selectedIds.Contains(a.Id)).ToImmutableArray();
        }
        catch (Exception error) when (error is ArgumentException or InvalidOperationException or FormatException)
        {
            return Failure(request, "invalid", [Invalid(request, "O resultado da geração não preserva a estrutura e o histórico do planejamento.")]);
        }
        var retainedIds = request.Document.Assignments
            .Where(a => !ScheduleWindow.Contains(a, request.Start, request.End)
                || a.Pinned==true || LaborRules.AuthorizedHolidayShift(request.Document.Company, a)).Select(a => a.Id).ToHashSet();
        var generatedIds = selected.Where(a => !retainedIds.Contains(a.Id)).Select(a => a.Id).ToHashSet();
        if (selected.Any(a => generatedIds.Contains(a.Id) && !IntervalTimingPolicy.HasWorkAroundPause(a)))
            return Failure(request, "invalid", [Invalid(request, "A escala gerada posiciona intervalo perto da entrada ou saída; os turnos anteriores foram preservados.")]);
        if (!WeeklyIntervalPolicy.AllowsGeneration(assignments, generatedIds))
            return Failure(request, "invalid", [Invalid(request, "A escala gerada varia o intervalo do funcionário dentro da mesma semana; os turnos anteriores foram preservados.")]);
        var evaluated = analyzer.Analyze(request with { Document = request.Document with { Assignments = assignments } });
        var introduced = GenerationConformance.NewErrors(request.Document, assignments, evaluated.Conflicts);
        if (introduced.Count > 0)
            return Failure(request, "invalid", [Invalid(request, "A escala gerada introduz violações obrigatórias ("
                + string.Join(", ", introduced.Select(i => i.Code).Distinct().Order()) + "); os turnos anteriores foram preservados.")]);

        var missing = ContractMinimumPolicy.Missing(request.Document, request.Start, request.End, assignments);
        if (missing.Count > 0)
            return Failure(request, "invalid", missing.Select(m => new ScheduleIssue("error", "solverInvalid",
                $"Não foi possível completar a carga contratada: faltam {m.RequiredSeconds}s. Os turnos anteriores foram preservados.",
                request.Start, request.End, EmployeeId: m.EmployeeId)).ToArray());

        return evaluated with
        {
            Decisions = ScheduleExplanation.Describe(request.Document.Employees, selected).ToList(),
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
