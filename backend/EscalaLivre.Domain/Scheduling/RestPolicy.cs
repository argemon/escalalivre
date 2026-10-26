namespace EscalaLivre.Domain.Scheduling;

public static class RestPolicy
{
    public static TimeSpan Required(CompanyRules company, Employee employee)
        => Required(company, EffectiveWorkPolicy.RuleFor(company, employee));

    public static bool Conflicts(ShiftAssignment first, ShiftAssignment second, TimeSpan rest)
        => Conflicts(first.Start, first.End, second.Start, second.End, rest);

    public static TimeSpan RegimeMinimum(WorkloadRule rule)
        => rule.RegimeType == "hourBased" ? TimeSpan.FromHours(rule.RestUnits) : TimeSpan.Zero;

    public static TimeSpan Required(CompanyRules company, WorkloadRule rule)
        => TimeSpan.FromTicks(Math.Max(company.MinimumRest.Ticks, RegimeMinimum(rule).Ticks));

    // All supplied history must belong to the candidate's employee, on both sides of the period.
    public static bool CanFit(DateTime start, DateTime end, IEnumerable<ShiftAssignment> history, TimeSpan rest)
        => history.All(a => !Conflicts(start, end, a.Start, a.End, rest));

    public static bool Conflicts(DateTime start, DateTime end, DateTime otherStart, DateTime otherEnd, TimeSpan rest)
        => start < otherEnd + rest && otherStart < end + rest;

    // The diagnostic walks start-ordered history and retains the largest previous end.
    public static bool ViolatesPrevious(DateTime start, DateTime latestEnd, TimeSpan rest)
        => latestEnd != DateTime.MinValue && start - latestEnd < rest;
}
