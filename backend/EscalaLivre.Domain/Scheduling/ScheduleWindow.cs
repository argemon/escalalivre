namespace EscalaLivre.Domain.Scheduling;

public static class ScheduleWindow
{
    // A shift belongs to its start day, even when it ends outside the selected dates.
    public static bool Contains(ShiftAssignment shift, DateTime start, DateTime end)
        => shift.Start.Date >= start.Date && shift.Start.Date <= end.Date;

    public static IReadOnlyList<ShiftAssignment> Replace(
        IReadOnlyList<ShiftAssignment> original, IEnumerable<ShiftAssignment> generated, DateTime start, DateTime end)
        => original.Where(a => !Contains(a, start, end))
            .Concat(generated.Where(a => Contains(a, start, end))).ToList();

    public static bool RestConflict(ShiftAssignment a, ShiftAssignment b, TimeSpan rest)
        => a.Start < b.End + rest && b.Start < a.End + rest;

    public static DateTime WeekStart(DateTime date) => date.Date.AddDays(-(int)date.DayOfWeek);

    public static IEnumerable<DateTime> Weeks(ShiftAssignment shift)
    {
        for (var week = WeekStart(shift.Start); week < shift.End; week = week.AddDays(7)) yield return week;
    }

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
