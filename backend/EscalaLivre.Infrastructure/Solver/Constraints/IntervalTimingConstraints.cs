using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Infrastructure.Solver;

public sealed class IntervalTimingConstraints : IScheduleConstraintTranslator
{
    public void Apply(ScheduleModelContext context, OptimizationBudget budget)
    {
        var input = context.Input;
        var retained = input.HolidayShifts.Select(a => a.Id).ToHashSet();
        foreach (var candidate in input.Candidates.Where(a => !retained.Contains(a.Id)))
        {
            budget.Spend();
            if (!IntervalTimingPolicy.HasWorkAroundPause(candidate))
                context.Model.Add(context.DecisionVars[candidate.Id] == 0);
            var employee = input.Request.Document.Employees.First(e => e.Id == candidate.EmployeeId);
            if (employee.FixedInterval is null && IntervalTimingPolicy.IsEarly(input.Request.Document.Company, candidate))
            {
                context.PreferUnanticipatedIntervals ??= context.Model.NewBoolVar("prefer_unanticipated_intervals");
                context.Model.Add(context.DecisionVars[candidate.Id] == 0).OnlyEnforceIf(context.PreferUnanticipatedIntervals);
            }
        }
    }
}
