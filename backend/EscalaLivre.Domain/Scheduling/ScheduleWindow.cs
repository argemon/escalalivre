namespace EscalaLivre.Domain.Scheduling;

public static class ScheduleWindow
{
    // A shift belongs to its start day, even when it ends outside the selected dates.
    public static bool Contains(ShiftAssignment shift, DateTime start, DateTime end)
        => shift.Start.Date >= start.Date && shift.Start.Date <= end.Date;

    public static IReadOnlyList<ShiftAssignment> Replace(
        IReadOnlyList<ShiftAssignment> original, IEnumerable<ShiftAssignment> generated, DateTime start, DateTime end)
        {
            var retained=original.Where(a => a.Pinned==true || !Contains(a,start,end)).ToArray();
            return retained.Concat(generated.Where(a=>Contains(a,start,end)&&!retained.Any(old=>old.Pinned==true&&old.Id==a.Id))).ToList();
        }


    public static DateTime WeekStart(DateTime date) => date.Date.AddDays(-(int)date.DayOfWeek);

    public static IEnumerable<DateTime> Weeks(ShiftAssignment shift)
    {
        for (var week = WeekStart(shift.Start); week < shift.End; week = week.AddDays(7)) yield return week;
    }


}
