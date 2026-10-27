using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Domain.Planning;

namespace EscalaLivre.Domain.Regimes;

public sealed class DayBasedRegime : IShiftRegime
{
    public string Type => DayCycleConfiguration.Type;

    public bool CanWork(DateTime candidateStart, DateTime candidateEnd, IReadOnlyList<ShiftAssignment> existingAssignments,
        WorkloadRule rule, BreakWindow? candidateBreak = null)
    {
        var configuration = Configuration(rule);
        return RegimeEligibility.CanWork(configuration, candidateStart, candidateEnd, existingAssignments, candidateBreak);
    }

    public DateTime EstimateStartAfterRest(DateTime lastShiftEnd, WorkloadRule rule)
        => lastShiftEnd.Date.AddDays(Math.Max(1, Configuration(rule).RestDays.Value)).Add(lastShiftEnd.TimeOfDay);

    private static DayCycleConfiguration Configuration(WorkloadRule rule)
        => RegimeConfiguration.From(rule) as DayCycleConfiguration
            ?? throw new ArgumentException("The day strategy requires a day configuration.", nameof(rule));
}
