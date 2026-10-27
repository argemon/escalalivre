using EscalaLivre.Domain.Planning;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Domain.Regimes;

// Only the constraint families declared by the regime. Company and global schedule rules remain separate.
public static class RegimeEligibility
{
    public static bool CanWork(RegimeConfiguration configuration, DateTime start, DateTime end,
        IReadOnlyList<ShiftAssignment> history, BreakWindow? pause = null)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        return end > start
            && !EffectiveWorkPolicy.ExceedsRegimeWork(EffectiveWorkPolicy.Measure(start, end, pause), configuration)
            && (configuration.RestBetweenShifts is not { } rest || RestPolicy.CanFit(start, end, history, rest.Value))
            && (configuration.RollingCycle is not { } cycle || DayCyclePolicy.CanAdd(start, history, cycle));
    }
}
