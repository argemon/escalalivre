using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Domain.Regimes;

public interface IShiftRegime
{
    string Type { get; }
    bool CanWork(DateTime candidateStart, DateTime candidateEnd, IReadOnlyList<ShiftAssignment> existingAssignments, WorkloadRule rule, BreakWindow? candidateBreak = null);
    DateTime GetNextEligibleStart(DateTime lastShiftEnd, WorkloadRule rule);
}
