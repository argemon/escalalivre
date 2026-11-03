using EscalaLivre.Domain.Scheduling;
using Google.OrTools.Sat;

namespace EscalaLivre.Infrastructure.Solver;

public sealed class IntervalDurationConstraints : IScheduleConstraintTranslator
{
    public void Apply(ScheduleModelContext context, OptimizationBudget budget)
    {
        var input = context.Input;
        var company = input.Request.Document.Company;
        var retained = input.HolidayShifts.Select(a => a.Id).ToHashSet();
        var anchored = input.Preserved.Concat(input.HolidayShifts).Where(a => a.Break is not null)
            .Select(a => (a.EmployeeId, Week: ScheduleWindow.WeekStart(a.Start))).ToHashSet();
        foreach (var candidate in input.Candidates.Where(a => !retained.Contains(a.Id)))
        {
            budget.Spend();
            // Historical routines and explicit fixed intervals are user constraints.
            if (anchored.Contains((candidate.EmployeeId, ScheduleWindow.WeekStart(candidate.Start)))) continue;
            var employee = input.Request.Document.Employees.First(e => e.Id == candidate.EmployeeId);
            long excess = IntervalPolicy.Extension(company, employee, candidate).Ticks / TimeSpan.TicksPerSecond;
            if (excess <= 0) continue;
            context.IntervalExtensionSeconds.Add(candidate.Id, excess);
            context.PreferMinimumIntervals ??= context.Model.NewBoolVar("prefer_minimum_intervals");
            context.Model.Add(context.DecisionVars[candidate.Id] == 0).OnlyEnforceIf(context.PreferMinimumIntervals);
        }
        if (context.IntervalExtensionSeconds.Count > 0)
            context.IntervalExtension = LinearExpr.Sum(context.IntervalExtensionSeconds.Select(pair =>
                LinearExpr.Term(context.DecisionVars[pair.Key], pair.Value)));
    }
}
