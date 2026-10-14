using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Domain.Regimes;

public sealed class HourBasedRegime : IShiftRegime
{
    public string Type => "hourBased";

    public bool CanWork(DateTime candidateStart, DateTime candidateEnd, IReadOnlyList<ShiftAssignment> existingAssignments, WorkloadRule rule)
    {
        if (candidateEnd - candidateStart > TimeSpan.FromHours(rule.WorkUnits)) return false;
        var last = existingAssignments.OrderByDescending(x => x.End).FirstOrDefault();
        if (last is null)
        {
            return true;
        }

        var requiredRest = TimeSpan.FromHours(rule.RestUnits);
        return candidateStart - last.End >= requiredRest && candidateEnd - candidateStart <= TimeSpan.FromHours(rule.WorkUnits);
    }

    public DateTime GetNextEligibleStart(DateTime lastShiftEnd, WorkloadRule rule)
        => lastShiftEnd.AddHours(rule.RestUnits);
}
