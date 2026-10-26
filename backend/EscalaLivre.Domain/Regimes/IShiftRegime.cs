using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Domain.Regimes;

/// <summary>Regime-specific checks only, for structurally valid civil inputs and a matching rule.</summary>
/// <remarks>History contains all shifts of one employee, before and after the candidate, excluding the candidate
/// being edited. This pure check neither mutates inputs nor certifies company rest, intervals, availability,
/// daily/weekly limits, calendar permissions or coverage. Empty history is allowed; order is immaterial.
/// Day regimes constrain distinct start dates; hour regimes constrain net work and bilateral regime rest.</remarks>
public interface IShiftRegime
{
    string Type { get; }

    /// <summary>Returns false for a nonpositive candidate window or a violation of this regime's constraints.</summary>
    bool CanWork(DateTime candidateStart, DateTime candidateEnd, IReadOnlyList<ShiftAssignment> existingAssignments,
        WorkloadRule rule, BreakWindow? candidateBreak = null);

    /// <summary>Local calendar estimate from an end and rest units. No history or global eligibility guarantee.</summary>
    /// <remarks>Legacy day behavior advances at least one day even with zero rest units; hour behavior adds rest hours.
    /// Recheck any candidate against full history and all applicable schedule policies.</remarks>
    DateTime EstimateStartAfterRest(DateTime lastShiftEnd, WorkloadRule rule);
}
