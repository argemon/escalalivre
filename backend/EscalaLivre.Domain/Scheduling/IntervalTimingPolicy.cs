namespace EscalaLivre.Domain.Scheduling;

// Operational generation guard, not a statutory one-hour minimum around a pause.
// Existing/manual schedules keep the structural and diagnostic contract of IntervalPolicy.
public static class IntervalTimingPolicy
{
    public static TimeSpan WorkMargin => TimeSpan.FromHours(1);

    public static bool HasWorkAroundPause(ShiftAssignment shift)
        => shift.Break is not {} pause || (pause.Start - shift.Start >= WorkMargin && shift.End - pause.End >= WorkMargin);

    public static bool IsEarly(CompanyRules company, ShiftAssignment shift)
        => shift.Break is {} pause && pause.Start - shift.Start < company.Lunch.PreferredAfter;
}
