namespace EscalaLivre.Domain.Scheduling;

public sealed record ScheduleEvaluation(
    IReadOnlyList<ScheduleIssue> Conflicts,
    CoverageAssessment Coverage,
    IReadOnlyList<HiringSuggestion> HiringSuggestions,
    IReadOnlyList<OptimizationSuggestion> OptimizationSuggestions);

// Evaluates the complete assignment history; only demand is bounded by start/end.
public sealed class ScheduleEvaluator
{
    public ScheduleEvaluation Evaluate(EscalaLivreDocument document, DateTime start, DateTime end, IReadOnlyList<ShiftAssignment> assignments)
    {
        var conflicts = ScheduleRules.Diagnose(document, assignments).ToList();
        var coverage = ScheduleCoverage.Evaluate(document, start, end, assignments);
        return new(conflicts, coverage,
            HiringDemand.Suggest(coverage.Gaps, document.Company.DefaultWorkload.WeeklyLimitHours),
            ScheduleSuggestions.Suggest(assignments, coverage.Blocks).ToList());
    }
}
