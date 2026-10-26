using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Scheduling;
using EscalaLivre.Domain.Scheduling;
using Google.OrTools.Sat;

namespace EscalaLivre.Infrastructure.Solver;

public sealed class RestConstraints : IScheduleConstraintTranslator
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
            WorkloadRule rule = EffectiveWorkPolicy.RuleFor(request.Document.Company, employee);
            TimeSpan rest = RestPolicy.Required(request.Document.Company, rule);
            var restHistory = history[employee.Id].Where(a => a.End + rest > request.Start.Date && a.Start < request.End.Date.AddDays(2) + rest).ToList();
            foreach (var candidate in group)
            {
                foreach (var existing in restHistory)
                {
                    budget.Spend();
                    if (!RestPolicy.Conflicts(candidate, existing, rest)) continue;
                    model.Add(decisionVars[candidate.Id] == 0);
                    break;
                }
            }
            var ordered = group.OrderBy(x => x.Start).ToList();
            for (int i = 0; i < ordered.Count; i++)
            for (int j = i + 1; j < ordered.Count && ordered[j].Start < ordered[i].End + rest; j++)
                { if(ordered[i].Start.Date==ordered[j].Start.Date)continue; budget.Spend(); model.Add(decisionVars[ordered[i].Id] + decisionVars[ordered[j].Id] <= 1); }
        }

    }
}
