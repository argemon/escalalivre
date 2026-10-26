using EscalaLivre.Domain.Planning;

namespace EscalaLivre.Domain.Scheduling;

public static class DayCyclePolicy
{
    public static int Length(DayCycleConfiguration regime) => regime.CycleDays.Value;

    // Diagnostic projections stay simple; their configuration crosses the same explicit validated mapping.
    public static int Length(WorkloadRule rule) => Length(RequireDays(rule));

    private static DayCycleConfiguration RequireDays(WorkloadRule rule)
        => RegimeConfiguration.From(rule) as DayCycleConfiguration
            ?? throw new ArgumentException("A day cycle requires day units.", nameof(rule));

    public static int WorkedDates(IEnumerable<ShiftAssignment> history, DateTime first, DateTime last)
        => history.Where(a => a.Start.Date >= first && a.Start.Date <= last)
            .Select(a => a.Start.Date).Distinct().Count();

    public static bool ExceedsEndingOn(IEnumerable<ShiftAssignment> history, DateTime last, WorkloadRule rule)
        => ExceedsEndingOn(history, last, RequireDays(rule));

    public static bool ExceedsEndingOn(IEnumerable<ShiftAssignment> history, DateTime last, DayCycleConfiguration regime)
        => WorkedDates(history, last.Date.AddDays(1 - Length(regime)), last.Date) > regime.WorkDays.Value;

    // Check every rolling window containing the added date, including future history.
    public static bool CanAdd(DateTime start, IReadOnlyList<ShiftAssignment> history, DayCycleConfiguration regime)
    {
        int cycle = Length(regime);
        for (var last = start.Date; last < start.Date.AddDays(cycle); last = last.AddDays(1))
        {
            var first = last.AddDays(1 - cycle);
            int dates = WorkedDates(history, first, last);
            if (!history.Any(a => a.Start.Date == start.Date)) dates++;
            if (dates > regime.WorkDays.Value) return false;
        }
        return true;
    }
}
