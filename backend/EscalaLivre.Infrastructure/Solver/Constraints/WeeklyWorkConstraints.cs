using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Scheduling;
using EscalaLivre.Domain.Planning;
using EscalaLivre.Domain.Scheduling;
using Google.OrTools.Sat;

namespace EscalaLivre.Infrastructure.Solver;

public sealed class WeeklyWorkConstraints : IScheduleConstraintTranslator
{
    public void Apply(ScheduleModelContext context, OptimizationBudget budget)
    {
        var request = context.Input.Request;
        var model = context.Model;
        var candidates = context.Input.Candidates;
        var history = context.Input.History;
        var decisionVars = context.DecisionVars;
        foreach (var employeeWeek in candidates.SelectMany(a => ScheduleWindow.Weeks(a).Select(week => new { Shift = a, Week = week }))
                     .GroupBy(x => new { x.Shift.EmployeeId, x.Week }))
        {
            Employee employee = request.Document.Employees.First(x => x.Id == employeeWeek.Key.EmployeeId);
            var weeklyLimit = EffectiveWorkPolicy.WeeklyLimit(request.Document.Company, employee);
            var week = employeeWeek.Key.Week;
            long fixedWork = history[employee.Id].Sum(a => EffectiveWorkPolicy.WorkTicksInWeek(a, week));
            var weightedWork = employeeWeek.Select(x => LinearExpr.Term(decisionVars[x.Shift.Id], EffectiveWorkPolicy.WorkTicksInWeek(x.Shift, week)));
            model.Add(LinearExpr.Sum(weightedWork) <= ScheduleCapacityPolicy.RemainingWeeklyTicks(weeklyLimit, new Duration(TimeSpan.FromTicks(fixedWork))));
        }

        foreach(var group in candidates.GroupBy(a=>(a.EmployeeId,Week:ScheduleWindow.WeekStart(a.Start))))
        {
            var employee=request.Document.Employees.First(e=>e.Id==group.Key.EmployeeId);
            if(employee.AllowsOvertime || WeeklyWorkPlanPolicy.For(request.Document.Company,employee)?.FlexibleWorkDays is null) continue;
            long allowed=FlexibleContractPolicy.NormalWeekSeconds(request.Document.Company,employee,group.Key.Week)*TimeSpan.TicksPerSecond;
            long preserved=history[employee.Id].Where(a=>ScheduleWindow.WeekStart(a.Start)==group.Key.Week).Sum(a=>EffectiveWorkPolicy.Measure(a).Ticks);
            model.Add(LinearExpr.Sum(group.Select(a=>LinearExpr.Term(decisionVars[a.Id],EffectiveWorkPolicy.Measure(a).Ticks)))<=Math.Max(0,allowed-preserved));
        }

    }
}
