namespace EscalaLivre.Infrastructure.Solver;

internal static class CalendarDays
{
    internal static IEnumerable<DateTime> Inclusive(DateTime start, DateTime end)
    {
        for (var day = start.Date; day < end.Date.AddDays(1); day = day.AddDays(1)) yield return day;
    }
}
