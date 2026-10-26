using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Domain.Planning;

namespace EscalaLivre.Domain.Regimes;

public sealed class HourBasedRegime : IShiftRegime
{
    public string Type => "hourBased";

    public bool CanWork(DateTime candidateStart, DateTime candidateEnd, IReadOnlyList<ShiftAssignment> existingAssignments,
        WorkloadRule rule, BreakWindow? candidateBreak = null)
    {
        var configuration = Configuration(rule);
        return candidateEnd > candidateStart
            && !EffectiveWorkPolicy.ExceedsHourRegime(EffectiveWorkPolicy.Measure(candidateStart, candidateEnd, candidateBreak), configuration)
            && RestPolicy.CanFit(candidateStart, candidateEnd, existingAssignments, TimeSpan.FromHours(configuration.RestHours.Value));
    }

    public DateTime EstimateStartAfterRest(DateTime lastShiftEnd, WorkloadRule rule)
        => lastShiftEnd.AddHours(Configuration(rule).RestHours.Value);

    private static HourCycleConfiguration Configuration(WorkloadRule rule)
        => RegimeConfiguration.From(rule) as HourCycleConfiguration
            ?? throw new ArgumentException("The hour strategy requires an hour configuration.", nameof(rule));
}
