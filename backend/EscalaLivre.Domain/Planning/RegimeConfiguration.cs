using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Domain.Planning;

public abstract record RegimeConfiguration
{
    public WeeklyHours WeeklyLimit { get; }
    public Duration DefaultShiftDuration { get; }

    private protected RegimeConfiguration(WeeklyHours weeklyLimit, Duration defaultShiftDuration)
    {
        WeeklyLimit = weeklyLimit ?? throw new ArgumentNullException(nameof(weeklyLimit));
        DefaultShiftDuration = defaultShiftDuration ?? throw new ArgumentNullException(nameof(defaultShiftDuration));
        if (defaultShiftDuration.Value == TimeSpan.Zero) throw new ArgumentException("A work duration must be positive.");
    }

    public static RegimeConfiguration From(WorkloadRule rule)
    {
        ArgumentNullException.ThrowIfNull(rule);
        return rule.RegimeType switch
        {
            "dayBased" => new DayCycleConfiguration(new(rule.WorkUnits), new(rule.RestUnits), new(rule.WeeklyLimitHours), new(rule.DefaultShiftDuration)),
            "hourBased" => new HourCycleConfiguration(new(rule.WorkUnits), new(rule.RestUnits), new(rule.WeeklyLimitHours), new(rule.DefaultShiftDuration)),
            _ => throw new ArgumentException("Unknown regime configuration.", nameof(rule))
        };
    }
}

public sealed record DayCycleConfiguration : RegimeConfiguration
{
    public DayCount WorkDays { get; }
    public DayCount RestDays { get; }
    public DayCount CycleDays => new(checked(WorkDays.Value + RestDays.Value));

    public DayCycleConfiguration(DayCount workDays, DayCount restDays, WeeklyHours weeklyLimit, Duration defaultShiftDuration)
        : base(weeklyLimit, defaultShiftDuration)
    {
        WorkDays = workDays ?? throw new ArgumentNullException(nameof(workDays));
        RestDays = restDays ?? throw new ArgumentNullException(nameof(restDays));
        if (workDays.Value == 0 || (long)workDays.Value + restDays.Value > int.MaxValue)
            throw new ArgumentException("A cycle needs positive work days and a representable total.");
    }
}

public sealed record HourCycleConfiguration : RegimeConfiguration
{
    public WholeHours WorkHours { get; }
    public WholeHours RestHours { get; }

    public HourCycleConfiguration(WholeHours workHours, WholeHours restHours, WeeklyHours weeklyLimit, Duration defaultShiftDuration)
        : base(weeklyLimit, defaultShiftDuration)
    {
        WorkHours = workHours ?? throw new ArgumentNullException(nameof(workHours));
        RestHours = restHours ?? throw new ArgumentNullException(nameof(restHours));
        if (workHours.Value == 0) throw new ArgumentException("A regime needs positive work hours.");
    }
}
