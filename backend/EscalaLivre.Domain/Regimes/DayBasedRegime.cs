using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Domain.Planning;

namespace EscalaLivre.Domain.Regimes;

public sealed class DayBasedRegime : IShiftRegime
{
    public string Type => "dayBased";

    public bool CanWork(DateTime candidateStart, DateTime candidateEnd, IReadOnlyList<ShiftAssignment> existingAssignments,
        WorkloadRule rule, BreakWindow? candidateBreak = null)
    {
        var configuration = Configuration(rule);
        return candidateEnd > candidateStart && DayCyclePolicy.CanAdd(candidateStart, existingAssignments, configuration);
    }

    public DateTime EstimateStartAfterRest(DateTime lastShiftEnd, WorkloadRule rule)
        => lastShiftEnd.Date.AddDays(Math.Max(1, Configuration(rule).RestDays.Value)).Add(lastShiftEnd.TimeOfDay);

    private static DayCycleConfiguration Configuration(WorkloadRule rule)
        => RegimeConfiguration.From(rule) as DayCycleConfiguration
            ?? throw new ArgumentException("The day strategy requires a day configuration.", nameof(rule));
}
