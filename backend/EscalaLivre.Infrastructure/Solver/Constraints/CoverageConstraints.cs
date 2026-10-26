using EscalaLivre.Domain.Scheduling;
using Google.OrTools.Sat;

namespace EscalaLivre.Infrastructure.Solver;

public sealed class CoverageConstraints : IScheduleConstraintTranslator
{
    public void Apply(ScheduleModelContext context, OptimizationBudget budget)
    {
        var input = context.Input;
        var request = input.Request;
        var model = context.Model;
        var decisions = context.DecisionVars;
        int blockIndex = 0;
        foreach (var block in CoverageDemand.Blocks(request.Document.Company, request.Start, request.End, input.CoverageCandidates))
        {
            var covering = input.CoverageCandidates.Where(a => CoverageDemand.Covers(a, block.Start, block.End)).ToList();
            // D1 correction: OR the covering assignments of each employee, including overlapping fixed history.
            var present = new Dictionary<Guid, BoolVar>();
            foreach (var person in covering.GroupBy(a => a.EmployeeId))
            {
                var active = model.NewBoolVar($"person_{blockIndex}_{person.Key:N}");
                foreach (var shift in person) model.Add(decisions[shift.Id] <= active);
                model.Add(active <= LinearExpr.Sum(person.Select(a => decisions[a.Id])));
                present.Add(person.Key, active);
            }
            var allocation = new Dictionary<Guid, List<BoolVar>>();
            foreach (var requirement in block.Rules)
            {
                budget.Spend();
                var eligible = covering.Where(a => ScheduleRules.CanCover(request.Document.Employees.First(e => e.Id == a.EmployeeId), requirement)).ToList();
                // Preserve the old budget unit: every eligible assignment/requirement pair, even when deduplicated below.
                foreach (var shift in eligible) budget.Spend();
                var allocated = new List<LinearExpr>();
                foreach (var person in eligible.Select(a => a.EmployeeId).Distinct())
                {
                    if (requirement.Scope == "team") { allocated.Add(present[person]); continue; }
                    var assigned = model.NewBoolVar($"coverage_{blockIndex}_{person:N}_{requirement.Role}");
                    model.Add(assigned <= present[person]);
                    if (!allocation.TryGetValue(person, out var assignments)) allocation[person] = assignments = [];
                    assignments.Add(assigned);
                    allocated.Add(assigned);
                }
                var shortage = model.NewIntVar(0, requirement.MinimumEmployees, $"shortage_{context.ShortageTerms.Count}");
                model.Add(LinearExpr.Sum(allocated) + shortage >= requirement.MinimumEmployees);
                context.ShortageTerms.Add(LinearExpr.Term(shortage, ScheduleObjective.ShortageWeight(block.End - block.Start)));
            }
            foreach (var person in allocation) model.Add(LinearExpr.Sum(person.Value) <= present[person.Key]);
            var relevant = covering.Where(a => block.Rules.Any(r => r.MinimumEmployees > 0
                && ScheduleRules.CanCover(request.Document.Employees.First(e => e.Id == a.EmployeeId), r))).Select(a => a.EmployeeId).Distinct().ToList();
            if (relevant.Count > 0)
            {
                var occupied = model.NewBoolVar($"someone_present_{blockIndex}");
                model.Add(LinearExpr.Sum(relevant.Select(id => present[id])) >= 1).OnlyEnforceIf(occupied);
                model.Add(LinearExpr.Sum(relevant.Select(id => present[id])) == 0).OnlyEnforceIf(occupied.Not());
                context.OccupancyTerms.Add(LinearExpr.Term(occupied, ScheduleObjective.OccupancyWeight(block.End - block.Start)));
            }
            blockIndex++;
        }
    }
}
