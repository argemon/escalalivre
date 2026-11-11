using EscalaLivre.Domain.Scheduling;
using Google.OrTools.Sat;

namespace EscalaLivre.Infrastructure.Solver;

public sealed class WeeklyIntervalConstraints : IScheduleConstraintTranslator
{
    public void Apply(ScheduleModelContext context, OptimizationBudget budget)
    {
        var input = context.Input;
        // Authorized holiday assignments are retained data, even inside the period.
        var fixedPatterns = input.Preserved.Concat(input.RetainedInside).Where(a => a.Break is not null)
            .ToLookup(a => (a.EmployeeId, Week: ScheduleWindow.WeekStart(a.Start)));
        var holidays = input.RetainedInside.Select(a => a.Id).ToHashSet();
        foreach (var week in input.Candidates.Where(a => a.Break is not null && !holidays.Contains(a.Id))
                     .GroupBy(a => (a.EmployeeId, Week: ScheduleWindow.WeekStart(a.Start))))
        {
            var patterns = new List<BoolVar>();
            var anchors = fixedPatterns[week.Key].Select(WeeklyIntervalPolicy.Pattern).Distinct().ToArray();
            foreach (var pattern in week.GroupBy(WeeklyIntervalPolicy.Pattern))
            {
                budget.Spend();
                var enabled = context.Model.NewBoolVar($"lunch_{week.Key.EmployeeId:N}_{week.Key.Week:yyyyMMdd}_{patterns.Count}");
                patterns.Add(enabled);
                if (anchors.Any(anchor => anchor != pattern.Key)) context.Model.Add(enabled == 0);
                foreach (var candidate in pattern)
                {
                    budget.Spend();
                    context.Model.AddImplication(context.DecisionVars[candidate.Id], enabled);
                }
            }
            context.Model.Add(LinearExpr.Sum(patterns) <= 1);
        }
    }
}
