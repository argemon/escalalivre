using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Domain.Regimes;

public sealed class DayBasedRegime : IShiftRegime
{
    public string Type => "dayBased";

    public bool CanWork(DateTime candidateStart, DateTime candidateEnd, IReadOnlyList<ShiftAssignment> existingAssignments,
        WorkloadRule rule, BreakWindow? candidateBreak = null)
        => candidateEnd > candidateStart && DayCyclePolicy.CanAdd(candidateStart, existingAssignments, rule);

    public DateTime EstimateStartAfterRest(DateTime lastShiftEnd, WorkloadRule rule)
        => lastShiftEnd.Date.AddDays(Math.Max(1, rule.RestUnits)).Add(lastShiftEnd.TimeOfDay);
}
