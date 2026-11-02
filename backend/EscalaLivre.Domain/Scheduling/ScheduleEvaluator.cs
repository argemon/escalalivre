namespace EscalaLivre.Domain.Scheduling;

public sealed record ScheduleEvaluation(
    IReadOnlyList<ScheduleIssue> Conflicts,
    CoverageAssessment Coverage,
    IReadOnlyList<HiringSuggestion> HiringSuggestions,
    IReadOnlyList<OptimizationSuggestion> OptimizationSuggestions,
    IReadOnlyList<WorkloadSummary>? Workloads = null);

// Evaluates the complete assignment history; only demand is bounded by start/end.
public sealed class ScheduleEvaluator
{
    public ScheduleEvaluation Evaluate(EscalaLivreDocument document, DateTime start, DateTime end, IReadOnlyList<ShiftAssignment> assignments)
    {
        var conflicts = ScheduleRules.Diagnose(document, assignments).ToList();
        var workloads = ContractWorkPolicy.Summarize(document,start,end,assignments);
        foreach (var employee in document.Employees)
            if (WeeklyWorkPlanPolicy.For(document.Company,employee) is {} plan)
                foreach (var code in WeeklyWorkPlanPolicy.Issues(plan,EffectiveWorkPolicy.RuleFor(document.Company,employee).WeeklyLimitHours))
                    conflicts.Add(new("warning",code,"Revise a carga contratada, a distribuição diária e a compensação configuradas.",start.Date,end.Date.AddDays(1),employee.Role,employee.Id));
        foreach (var summary in workloads ?? [])
            if (summary.UnmetSeconds > 0)
                conflicts.Add(new("warning","workloadShortfall",$"Carga prevista: {summary.ExpectedSeconds}s; planejada: {summary.PlannedSeconds}s; saldo não atendido: {summary.UnmetSeconds}s.",summary.Days[0].Date,summary.Days[^1].Date.AddDays(1),document.Employees.First(e=>e.Id==summary.EmployeeId).Role,summary.EmployeeId));
        var coverage = ScheduleCoverage.Evaluate(document, start, end, assignments);
        return new(conflicts, coverage,
            HiringDemand.Suggest(coverage.Gaps, document.Company.DefaultWorkload.WeeklyLimitHours),
            ScheduleSuggestions.Suggest(assignments, coverage.Blocks).ToList(),workloads);
    }
}
