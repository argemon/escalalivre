using EscalaLivre.Domain.Planning;

namespace EscalaLivre.Domain.Scheduling;

// Measures civil work without repairing a saved break or rejecting business conflicts.
public static class EffectiveWorkPolicy
{
    public static WorkloadRule RuleFor(CompanyRules company, Employee employee)
        => employee.InheritsCompanyDefaults ? company.DefaultWorkload : employee.Workload;

    public static TimeSpan Measure(DateTime start, DateTime end, BreakWindow? pause = null)
        => end - start - (pause is null ? TimeSpan.Zero : pause.End - pause.Start);

    public static TimeSpan Measure(ShiftAssignment shift) => Measure(shift.Start, shift.End, shift.Break);
    public static TimeSpan DailyLimit(Employee employee) => TimeSpan.FromHours(employee.AllowsOvertime ? 10 : 8);
    public static bool ExceedsHourRegime(TimeSpan work, WorkloadRule rule)
        => rule.RegimeType == "hourBased" && work > TimeSpan.FromHours(rule.WorkUnits);

    public static bool ExceedsHourRegime(TimeSpan work, RegimeConfiguration regime)
        => regime is HourCycleConfiguration hours && work > TimeSpan.FromHours(hours.WorkHours.Value);

    public static long WorkTicksInWeek(ShiftAssignment shift, DateTime week)
    {
        var start = shift.Start > week ? shift.Start : week;
        var end = shift.End < week.AddDays(7) ? shift.End : week.AddDays(7);
        if (end <= start) return 0;
        long ticks = (end - start).Ticks;
        if (shift.Break is { } pause)
        {
            var from = pause.Start > start ? pause.Start : start;
            var to = pause.End < end ? pause.End : end;
            if (to > from) ticks -= (to - from).Ticks;
        }
        return ticks;
    }
}
