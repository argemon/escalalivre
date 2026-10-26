using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Scheduling;
using EscalaLivre.Domain.Planning;
using EscalaLivre.Domain.Scheduling;
using Google.OrTools.Sat;

namespace EscalaLivre.Infrastructure.Solver;

public sealed class DayCycleConstraints : IScheduleConstraintTranslator
{
    public void Apply(ScheduleModelContext context, OptimizationBudget budget)
    {
        var request = context.Input.Request;
        var model = context.Model;
        var candidates = context.Input.Candidates;
        var history = context.Input.History;
        var decisionVars = context.DecisionVars;
        foreach (IGrouping<Guid, ShiftAssignment> group in candidates.GroupBy(x => x.EmployeeId))
        {
            Employee employee = request.Document.Employees.First(x => x.Id == group.Key);
            if (context.Input.Settings.RegimeFor(employee.Id) is not DayCycleConfiguration regime) continue;
            int cycle = DayCyclePolicy.Length(regime);
            foreach (DateTime lastDay in CalendarDays.Inclusive(request.Start, request.End.AddDays(cycle - 1)))
            {
                DateTime firstDay = lastDay.AddDays(1 - cycle);
                int fixedDays = DayCyclePolicy.WorkedDates(history[employee.Id], firstDay, lastDay);
                model.Add(LinearExpr.Sum(group.Where(a => a.Start.Date >= firstDay && a.Start.Date <= lastDay).Select(a => decisionVars[a.Id])) <= ScheduleCapacityPolicy.RemainingCycleDates(regime, new DayCount(fixedDays)));
            }
        }

    }
}
