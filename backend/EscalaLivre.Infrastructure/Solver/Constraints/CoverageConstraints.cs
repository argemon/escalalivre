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
            var exclusiveAllocations=new Dictionary<Guid,List<BoolVar>>();
            foreach (var requirement in block.Rules)
            {
                budget.Spend();
                bool Allowed(ShiftAssignment a){var e=EmploymentPolicy.ForShift(request.Document.Employees.First(e=>e.Id==a.EmployeeId),a);return ScheduleRules.CanCover(e,requirement,request.Document.Roles) && (request.Document.Company.CoverageMode!="exclusive" || requirement.Scope=="team" || e.AccumulationRoleIds is null || e.AccumulationRoleIds.Count==0 || ExclusiveCoveragePolicy.AccumulationAllows(e,requirement,request.Document.Roles));}
                var eligible = covering.Where(Allowed).ToList();
                // Preserve the old budget unit: every eligible assignment/requirement pair, even when deduplicated below.
                foreach (var shift in eligible) budget.Spend();
                var allocated = new List<LinearExpr>();
                foreach (var person in eligible.Select(a => a.EmployeeId).Distinct())
                {
                    var eligiblePerson=model.NewBoolVar($"eligible_{blockIndex}_{person:N}_{context.ShortageTerms.Count}");
                    var choices=eligible.Where(a=>a.EmployeeId==person).Select(a=>decisions[a.Id]).ToArray();
                    foreach(var choice in choices)model.Add(choice<=eligiblePerson);
                    model.Add(eligiblePerson<=LinearExpr.Sum(choices));
                    var employee=request.Document.Employees.First(e=>e.Id==person);
                    if(request.Document.Company.CoverageMode=="exclusive" && requirement.Scope!="team" && (employee.AccumulationRoleIds is null || employee.AccumulationRoleIds.Count==0)){
                        var allocation=model.NewBoolVar($"allocation_{blockIndex}_{person:N}_{context.ShortageTerms.Count}");model.Add(allocation<=eligiblePerson);
                        if(!exclusiveAllocations.ContainsKey(person))exclusiveAllocations[person]=[];exclusiveAllocations[person].Add(allocation);allocated.Add(allocation);
                    }else allocated.Add(eligiblePerson);
                }
                var shortage = model.NewIntVar(0, requirement.MinimumEmployees, $"shortage_{context.ShortageTerms.Count}");
                model.Add(LinearExpr.Sum(allocated) + shortage >= requirement.MinimumEmployees);
                context.CoverageDeficitTerms.Add(LinearExpr.Term(shortage,(block.End-block.Start).Ticks/TimeSpan.TicksPerSecond));
                context.ShortageTerms.Add(LinearExpr.Term(shortage, ScheduleObjective.ShortageWeight(block.End - block.Start)));
            }

            foreach(var (person,allocations)in exclusiveAllocations)model.Add(LinearExpr.Sum(allocations)<=present[person]);
            var relevant = covering.Where(a => block.Rules.Any(r => r.MinimumEmployees > 0
                && ScheduleRules.CanCover(EmploymentPolicy.ForShift(request.Document.Employees.First(e => e.Id == a.EmployeeId),a), r, request.Document.Roles)
                && (request.Document.Company.CoverageMode!="exclusive" || r.Scope=="team" || request.Document.Employees.First(e=>e.Id==a.EmployeeId).AccumulationRoleIds is not {Count:>0} || ExclusiveCoveragePolicy.AccumulationAllows(request.Document.Employees.First(e=>e.Id==a.EmployeeId),r,request.Document.Roles)))).Select(a => a.EmployeeId).Distinct().ToList();
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
