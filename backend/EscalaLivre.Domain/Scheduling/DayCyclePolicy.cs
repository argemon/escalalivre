namespace EscalaLivre.Domain.Scheduling;

public static class DayCyclePolicy
{
    public static int Length(WorkloadRule rule) => Math.Max(1, rule.WorkUnits + rule.RestUnits);

    public static int WorkedDates(IEnumerable<ShiftAssignment> history, DateTime first, DateTime last)
        => history.Where(a => a.Start.Date >= first && a.Start.Date <= last)
            .Select(a => a.Start.Date).Distinct().Count();

    public static bool ExceedsEndingOn(IEnumerable<ShiftAssignment> history, DateTime last, WorkloadRule rule)
        => WorkedDates(history, last.Date.AddDays(1 - Length(rule)), last.Date) > rule.WorkUnits;

    // Check every rolling window containing the added date, including future history.
    public static bool CanAdd(DateTime start, IReadOnlyList<ShiftAssignment> history, WorkloadRule rule)
    {
        int cycle = Length(rule);
        for (var last = start.Date; last < start.Date.AddDays(cycle); last = last.AddDays(1))
        {
            var first = last.AddDays(1 - cycle);
            int dates = WorkedDates(history, first, last);
            if (!history.Any(a => a.Start.Date == start.Date)) dates++;
            if (dates > rule.WorkUnits) return false;
        }
        return true;
    }
}
