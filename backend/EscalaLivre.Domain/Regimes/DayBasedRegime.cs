using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Domain.Regimes;

public sealed class DayBasedRegime : IShiftRegime
{
    public string Type => "dayBased";

    public bool CanWork(DateTime candidateStart, DateTime candidateEnd, IReadOnlyList<ShiftAssignment> existingAssignments, WorkloadRule rule)
    {
        var cycle = Math.Max(1, rule.WorkUnits + rule.RestUnits);
        var dayIndex = (int)(candidateStart.Date - DateTime.UnixEpoch.Date).TotalDays % cycle;
        if (dayIndex >= rule.WorkUnits)
        {
            return false;
        }

        var weekStart = candidateStart.Date.AddDays(-(int)candidateStart.DayOfWeek);
        var weekEnd = weekStart.AddDays(7);
        var assignedHours = existingAssignments
            .Where(x => x.Start >= weekStart && x.Start < weekEnd)
            .Sum(x => (x.End - x.Start).TotalHours);

        return assignedHours + (candidateEnd - candidateStart).TotalHours <= rule.WeeklyLimitHours;
    }

    public DateTime GetNextEligibleStart(DateTime lastShiftEnd, WorkloadRule rule)
        => lastShiftEnd.Date.AddDays(Math.Max(1, rule.RestUnits)).Add(lastShiftEnd.TimeOfDay);
}
