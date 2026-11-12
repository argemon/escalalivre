namespace EscalaLivre.Domain.Scheduling;

// Explicit planning choice. Other contracts retain compensation and overtime rules.
public static class FiveDay42HoursPolicy
{
    public static bool AppliesTo(WeeklyWorkPlan plan) => plan.ContractedSeconds == 151200 &&
        (plan.FlexibleWorkDays == 5 || (plan.FlexibleWorkDays is null &&
            plan.DailySeconds.Count(s => s > 0) == 5 && plan.DailySeconds.Where(s => s > 0).All(s => s == 30240)));
    public static int? NormalDailySeconds(WeeklyWorkPlan plan) => AppliesTo(plan) ? plan.FiveDay42HourMode switch
    {
        "eightHours" => 28800,
        "completeWeek" => 30240,
        _ => null
    } : null;
}
