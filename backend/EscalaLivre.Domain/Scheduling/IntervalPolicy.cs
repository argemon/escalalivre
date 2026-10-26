namespace EscalaLivre.Domain.Scheduling;

public static class IntervalPolicy
{
    public static TimeSpan Required(TimeSpan work)
        => work > TimeSpan.FromHours(6) ? TimeSpan.FromHours(1) : work > TimeSpan.FromHours(4) ? TimeSpan.FromMinutes(15) : TimeSpan.Zero;

    public static bool Valid(ShiftAssignment shift)
    {
        var pause = shift.Break is null ? TimeSpan.Zero : shift.Break.End - shift.Break.Start;
        return (shift.Break is null || (shift.Break.Start > shift.Start && shift.Break.End < shift.End && pause > TimeSpan.Zero))
            && pause >= Required(EffectiveWorkPolicy.Measure(shift)) && pause <= TimeSpan.FromHours(2);
    }

    public static BreakWindow? ClosureOn(CompanyRules company, DateTime day)
    {
        if (company.MiddayClosure is not {} closure) return null;
        var date = day.Date.AddDays(closure.Start < company.OpensAt ? 1 : 0);
        return new(date + closure.Start.ToTimeSpan(), ScheduleRules.EndOn(date, closure.Start, closure.End));
    }

    public static IEnumerable<BreakWindow> Closures(CompanyRules company, DateTime start, DateTime end)
    {
        for (var day = start.Date.AddDays(-1); day <= end.Date; day = day.AddDays(1))
            if (ClosureOn(company, day) is {} closure && start < closure.End && closure.Start < end)
                yield return closure;
    }

    public static BreakWindow? FixedBreak(Employee employee, DateTime start)
    {
        if (employee.FixedInterval is not {} interval) return null;
        var day = start.Date;
        if (day + interval.Start.ToTimeSpan() <= start) day = day.AddDays(1);
        return new(day + interval.Start.ToTimeSpan(), ScheduleRules.EndOn(day, interval.Start, interval.End));
    }

    public static (TimeSpan Minimum, TimeSpan Maximum) VariableLimits(CompanyRules company, Employee employee,
        TimeSpan work, IReadOnlyList<BreakWindow> closures)
    {
        long minimum = Math.Max(Required(work).Ticks, company.Lunch.Minimum.Ticks);
        if (!employee.WorksDuringLunchClosure && closures.Count > 0)
            minimum = Math.Max(minimum, closures.Max(c => (c.End - c.Start).Ticks));
        long maximum = Math.Min(TimeSpan.FromHours(2).Ticks, Math.Max(minimum, company.Lunch.Maximum.Ticks));
        return (TimeSpan.FromTicks(minimum), TimeSpan.FromTicks(maximum));
    }

    public static bool ConflictsWithClosure(BreakWindow? pause, BreakWindow closure, bool worksDuringClosure)
        => worksDuringClosure
            ? pause is not null && pause.Start < closure.End && closure.Start < pause.End
            : pause is null || pause.Start > closure.Start || pause.End < closure.End;
}
