using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Domain.Regimes;

public sealed class HourBasedRegime : IShiftRegime
{
    public string Type => "hourBased";

    public bool CanWork(DateTime candidateStart, DateTime candidateEnd, IReadOnlyList<ShiftAssignment> existingAssignments,
        WorkloadRule rule, BreakWindow? candidateBreak = null)
        => candidateEnd > candidateStart
            && EffectiveWorkPolicy.Measure(candidateStart, candidateEnd, candidateBreak) <= TimeSpan.FromHours(rule.WorkUnits)
            && RestPolicy.CanFit(candidateStart, candidateEnd, existingAssignments, TimeSpan.FromHours(rule.RestUnits));

    public DateTime EstimateStartAfterRest(DateTime lastShiftEnd, WorkloadRule rule)
        => lastShiftEnd.AddHours(rule.RestUnits);
}
