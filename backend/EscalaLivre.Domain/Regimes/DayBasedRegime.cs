using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Domain.Regimes;

public sealed class DayBasedRegime : IShiftRegime
{
    public string Type => "dayBased";

    public bool CanWork(DateTime candidateStart, DateTime candidateEnd, IReadOnlyList<ShiftAssignment> existingAssignments, WorkloadRule rule)
    {
        var cycle = Math.Max(1, rule.WorkUnits + rule.RestUnits);
        var cycleStart = candidateStart.Date.AddDays(1 - cycle);
        var workedDays = existingAssignments.Where(x => x.Start.Date >= cycleStart && x.Start.Date <= candidateStart.Date)
            .Select(x => x.Start.Date).Append(candidateStart.Date).Distinct().Count();
        if (workedDays > rule.WorkUnits)
        {
            return false;
        }

        // Weekly work minutes (excluding breaks) are enforced by the solver and validator.
        return candidateEnd > candidateStart;
    }

    public DateTime GetNextEligibleStart(DateTime lastShiftEnd, WorkloadRule rule)
        => lastShiftEnd.Date.AddDays(Math.Max(1, rule.RestUnits)).Add(lastShiftEnd.TimeOfDay);
}
