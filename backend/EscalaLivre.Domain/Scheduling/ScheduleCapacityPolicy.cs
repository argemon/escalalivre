namespace EscalaLivre.Domain.Scheduling;

public static class ScheduleCapacityPolicy
{
    public static long WeeklyLimitTicks(WorkloadRule rule) => (long)Math.Floor(rule.WeeklyLimitHours * TimeSpan.TicksPerHour);
    public static long RemainingWeeklyTicks(WorkloadRule rule, long preservedWorkTicks)
        => Math.Max(0, WeeklyLimitTicks(rule) - preservedWorkTicks);
    public static int RemainingCycleDates(WorkloadRule rule, int preservedDates) => Math.Max(0, rule.WorkUnits - preservedDates);
}
