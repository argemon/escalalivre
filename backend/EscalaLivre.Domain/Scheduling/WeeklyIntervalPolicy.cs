namespace EscalaLivre.Domain.Scheduling;

// A routine belongs to the civil week of the shift's start. The date offset
// distinguishes a pause today from a night shift's pause tomorrow.
public static class WeeklyIntervalPolicy
{
    public static (TimeSpan Start, TimeSpan Duration)? Pattern(ShiftAssignment shift)
        => shift.Break is {} pause ? (pause.Start - shift.Start.Date, pause.End - pause.Start) : null;

    public static bool Compatible(ShiftAssignment a, ShiftAssignment b)
        => a.EmployeeId != b.EmployeeId || ScheduleWindow.WeekStart(a.Start) != ScheduleWindow.WeekStart(b.Start)
            || Pattern(a) is not {} first || Pattern(b) is not {} second || first == second;

    public static bool AllowsGeneration(IReadOnlyList<ShiftAssignment> proposed, IReadOnlySet<Guid> generatedIds)
    {
        foreach (var week in proposed.Where(a => a.Break is not null)
                     .GroupBy(a => (a.EmployeeId, Week: ScheduleWindow.WeekStart(a.Start))))
        {
            // Inherited irregular routines remain editable; new shifts cannot extend them.
            if (week.Any(a => generatedIds.Contains(a.Id)) && week.Select(Pattern).Distinct().Skip(1).Any())
                return false;
        }
        return true;
    }
}
