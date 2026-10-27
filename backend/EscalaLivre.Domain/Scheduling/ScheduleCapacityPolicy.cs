using EscalaLivre.Domain.Planning;

namespace EscalaLivre.Domain.Scheduling;

public static class ScheduleCapacityPolicy
{
    // Preserve fractional weekly hours and the existing floor to ticks; never silently wrap an overflow.
    public static long WeeklyLimitTicks(WeeklyHours limit) => checked((long)Math.Floor(limit.Value * TimeSpan.TicksPerHour));
    public static long RemainingWeeklyTicks(WeeklyHours limit, Duration preservedWork)
        => Math.Max(0, WeeklyLimitTicks(limit) - preservedWork.Value.Ticks);
    public static int RemainingCycleDates(DayCycleLimit regime, DayCount preservedDates)
        => Math.Max(0, regime.WorkDays.Value - preservedDates.Value);
}
