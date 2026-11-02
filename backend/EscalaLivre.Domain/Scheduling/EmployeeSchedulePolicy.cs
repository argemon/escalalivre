using EscalaLivre.Domain.Planning;

namespace EscalaLivre.Domain.Scheduling;

public static class EmployeeSchedulePolicy
{
    public static DayCycleLimit? Cycle(CompanyRules company, Employee employee)
        => WeeklyWorkPlanPolicy.For(company,employee)?.FlexibleWorkDays is {} days
            ? new(new(days),new(7-days)) : RegimeConfiguration.From(EffectiveWorkPolicy.RuleFor(company,employee)).RollingCycle;

    // Advisory only: special categories and collectively negotiated monthly rest are not inferred.
    public static IEnumerable<string> TransitionIssues(CompanyRules company, Employee employee, DateTime end)
    {
        if(end.Date < new DateTime(2026,12,16)) yield break;
        var rule=EffectiveWorkPolicy.RuleFor(company,employee);
        int maximum=end.Date>=new DateTime(2027,12,16)?40:42;
        if(Cycle(company,employee) is {} cycle && cycle.CycleDays.Value==7 && cycle.WorkDays.Value>5)
            yield return "weeklyRestTransition";
        if(rule.WeeklyPlan is {} plan && plan.ContractedSeconds>maximum*3600)
            yield return "contractHoursTransition";
    }
}
