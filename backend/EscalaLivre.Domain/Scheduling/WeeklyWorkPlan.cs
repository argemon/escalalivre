using System.Collections.Immutable;

namespace EscalaLivre.Domain.Scheduling;

public sealed record WeeklyCompensation
{
    public string Instrument { get; }
    public DateOnly StartsOn { get; }
    public DateOnly EndsOn { get; }
    public WeeklyCompensation(string instrument, DateOnly startsOn, DateOnly endsOn)
    {
        if (string.IsNullOrWhiteSpace(instrument) || instrument.Length > 200 || startsOn.Year < 1900 || endsOn.Year > 2100 || endsOn < startsOn)
            throw new ArgumentException("Instrumento e vigência da compensação inválidos.");
        Instrument = instrument; StartsOn = startsOn; EndsOn = endsOn;
    }
    public bool AppliesOn(DateOnly day) => day >= StartsOn && day <= EndsOn;
}

// Structural validity only. A sum mismatch or a ceiling conflict remains recoverable.
public sealed class WeeklyWorkPlan
{
    public int ContractedSeconds { get; }
    public IReadOnlyList<int> DailySeconds { get; }
    public WeeklyCompensation? Compensation { get; }
    public int? FlexibleWorkDays { get; }
    public WeeklyWorkPlan(int contractedSeconds, IReadOnlyList<int> dailySeconds, WeeklyCompensation? compensation = null, int? flexibleWorkDays = null)
    {
        if (contractedSeconds is < 1 or > 604800 || dailySeconds is null || dailySeconds.Count != 7 || dailySeconds.Any(s => s is < 0 or > 86400))
            throw new ArgumentException("Carga e distribuição devem usar segundos inteiros e sete dias.");
        if (flexibleWorkDays is < 1 or > 7) throw new ArgumentException("Quantidade de dias automáticos inválida.");
        ContractedSeconds = contractedSeconds; DailySeconds = dailySeconds.ToImmutableArray(); Compensation = compensation; FlexibleWorkDays = flexibleWorkDays;
    }
}

public static class WeeklyWorkPlanPolicy
{
    public static WeeklyWorkPlan Uniform(int seconds, IReadOnlyList<DayOfWeek> days, WeeklyCompensation? compensation = null)
        => Distribute(seconds, days, null, compensation);
    public static WeeklyWorkPlan ReducedFriday(int seconds, IReadOnlyList<DayOfWeek> days, int fridaySeconds, WeeklyCompensation? compensation = null)
        => Distribute(seconds, days, fridaySeconds, compensation);
    private static WeeklyWorkPlan Distribute(int seconds, IReadOnlyList<DayOfWeek> days, int? friday, WeeklyCompensation? compensation)
    {
        if (days is null || days.Count == 0 || days.Any(d => !Enum.IsDefined(d)) || days.Distinct().Count() != days.Count
            || friday is < 0 || friday > seconds || (friday.HasValue && (!days.Contains(DayOfWeek.Friday) || days.Count < 2)))
            throw new ArgumentException("Dias contratuais ou sexta inválidos.");
        var selected = days.Where(d => !friday.HasValue || d != DayOfWeek.Friday).OrderBy(d => d).ToArray();
        int remaining = seconds - (friday ?? 0);
        var values = new int[7];
        for (int i = 0; i < selected.Length; i++) values[(int)selected[i]] = remaining / selected.Length + (i < remaining % selected.Length ? 1 : 0);
        if (friday.HasValue) values[5] = friday.Value;
        return new(seconds, values, compensation);
    }
    public static WeeklyWorkPlan? For(CompanyRules company, Employee employee)
        => EffectiveWorkPolicy.RuleFor(company, employee).WeeklyPlan;
    public static bool HasContractPlans(EscalaLivreDocument document)
        => document.Employees.Any(e => For(document.Company, e) is not null);
    public static IReadOnlyList<string> Issues(WeeklyWorkPlan plan, double ceilingHours)
    {
        var issues = new List<string>();
        if (plan.FlexibleWorkDays is null && plan.DailySeconds.Sum() != plan.ContractedSeconds) issues.Add("distributionTotal");
        if (plan.ContractedSeconds > ceilingHours * 3600) issues.Add("contractAboveCeiling");
        if (plan.ContractedSeconds > 44 * 3600) issues.Add("contractAboveNormalLimit");
        var durations = plan.FlexibleWorkDays is {} count ? new[] { (plan.ContractedSeconds + count - 1) / count } : plan.DailySeconds;
        if (durations.Any(s => s > 36000)) issues.Add("distributionDailyLimit");
        if (durations.Any(s => s > 28800) && plan.Compensation is null) issues.Add("compensationRequired");
        return issues;
    }
    public static TimeSpan EndOffset(TimeOnly entry, int workSeconds, int pauseSeconds)
        => entry.ToTimeSpan() + TimeSpan.FromSeconds(workSeconds) + TimeSpan.FromSeconds(pauseSeconds);
}
