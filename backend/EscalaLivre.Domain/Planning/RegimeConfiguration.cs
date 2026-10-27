using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Domain.Planning;

public abstract record RegimeConfiguration
{
    private static readonly IReadOnlyDictionary<string, Func<WorkloadRule, RegimeConfiguration>> Mappings
        = new Dictionary<string, Func<WorkloadRule, RegimeConfiguration>>(StringComparer.Ordinal)
        {
            [DayCycleConfiguration.Type] = DayCycleConfiguration.FromRule,
            [HourCycleConfiguration.Type] = HourCycleConfiguration.FromRule
        };

    public WeeklyHours WeeklyLimit { get; }
    public Duration DefaultShiftDuration { get; }
    // Existing constraint families, not a general plugin or an eligibility guarantee.
    public abstract Duration? MaximumShiftWork { get; }
    // null means this regime does not constrain rest; zero still forbids overlap for hour regimes.
    public abstract Duration? RestBetweenShifts { get; }
    public abstract DayCycleLimit? RollingCycle { get; }

    protected RegimeConfiguration(WeeklyHours weeklyLimit, Duration defaultShiftDuration)
    {
        WeeklyLimit = weeklyLimit ?? throw new ArgumentNullException(nameof(weeklyLimit));
        DefaultShiftDuration = defaultShiftDuration ?? throw new ArgumentNullException(nameof(defaultShiftDuration));
        if (defaultShiftDuration.Value == TimeSpan.Zero) throw new ArgumentException("A work duration must be positive.");
    }

    public static RegimeConfiguration From(WorkloadRule rule)
    {
        ArgumentNullException.ThrowIfNull(rule);
        return rule.RegimeType is not null && Mappings.TryGetValue(rule.RegimeType, out var map) ? map(rule)
            : throw new ArgumentException("Unknown regime configuration.", nameof(rule));
    }

    public static bool IsSupported(string? type) => type is not null && Mappings.ContainsKey(type);
}

public sealed record DayCycleConfiguration : RegimeConfiguration
{
    public const string Type = "dayBased";
    public DayCount WorkDays => RollingCycle.WorkDays;
    public DayCount RestDays => RollingCycle.RestDays;
    public DayCount CycleDays => RollingCycle.CycleDays;
    public override Duration? MaximumShiftWork => null;
    public override Duration? RestBetweenShifts => null;
    public override DayCycleLimit RollingCycle { get; }

    internal static RegimeConfiguration FromRule(WorkloadRule rule)
        => new DayCycleConfiguration(new(rule.WorkUnits), new(rule.RestUnits), new(rule.WeeklyLimitHours), new(rule.DefaultShiftDuration));

    public DayCycleConfiguration(DayCount workDays, DayCount restDays, WeeklyHours weeklyLimit, Duration defaultShiftDuration)
        : base(weeklyLimit, defaultShiftDuration)
    {
        RollingCycle = new(workDays, restDays);
    }
}

public sealed record HourCycleConfiguration : RegimeConfiguration
{
    public const string Type = "hourBased";
    public WholeHours WorkHours { get; }
    public WholeHours RestHours { get; }
    public override Duration MaximumShiftWork => new(TimeSpan.FromHours(WorkHours.Value));
    public override Duration RestBetweenShifts => new(TimeSpan.FromHours(RestHours.Value));
    public override DayCycleLimit? RollingCycle => null;

    internal static RegimeConfiguration FromRule(WorkloadRule rule)
        => new HourCycleConfiguration(new(rule.WorkUnits), new(rule.RestUnits), new(rule.WeeklyLimitHours), new(rule.DefaultShiftDuration));

    public HourCycleConfiguration(WholeHours workHours, WholeHours restHours, WeeklyHours weeklyLimit, Duration defaultShiftDuration)
        : base(weeklyLimit, defaultShiftDuration)
    {
        WorkHours = workHours ?? throw new ArgumentNullException(nameof(workHours));
        RestHours = restHours ?? throw new ArgumentNullException(nameof(restHours));
        if (workHours.Value == 0) throw new ArgumentException("A regime needs positive work hours.");
    }
}
