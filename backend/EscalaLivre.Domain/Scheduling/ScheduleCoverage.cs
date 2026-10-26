namespace EscalaLivre.Domain.Scheduling;

public sealed record CoverageAssessment(IReadOnlyList<CoverageBlock> Blocks, IReadOnlyList<CoverageGap> Gaps, double Score);

public static class ScheduleCoverage
{
    public static CoverageAssessment Evaluate(EscalaLivreDocument document, DateTime start, DateTime end, IReadOnlyList<ShiftAssignment> assignments)
    {
        var coverage = BuildCoverage(document, start, end, assignments).ToList();
        var gaps=new List<CoverageGap>();
        foreach(var block in coverage.Where(x=>x.Assigned<x.Required))
        {
            int missing=block.Required-block.Assigned;
            int previous=gaps.FindLastIndex(g=>g.Role==block.Role);
            if(previous>=0&&gaps[previous].End==block.Start&&gaps[previous].MissingEmployees==missing)gaps[previous]=gaps[previous] with {End=block.End};
            else gaps.Add(new(block.Start,block.End,block.Role,missing));
        }
        double requiredMinutes = coverage.Sum(x => Math.Max(0, x.Required) * (x.End - x.Start).TotalMinutes);
        double coveredMinutes = coverage.Sum(x => Math.Min(x.Required, x.Assigned) * (x.End - x.Start).TotalMinutes);
        double score = requiredMinutes == 0 ? 1 : Math.Max(0, coveredMinutes / requiredMinutes);
        return new(coverage, gaps, Math.Round(score, 3, MidpointRounding.AwayFromZero));
    }

    private static IEnumerable<CoverageBlock> BuildCoverage(EscalaLivreDocument document, DateTime start, DateTime end,IReadOnlyList<ShiftAssignment> assignments)
    {
        foreach((DateTime Start, DateTime End, List<CoverageRequirement> Rules) block in CoverageDemand.Blocks(document.Company,start,end,assignments)) {
            var people=document.Employees.Where(e=>assignments.Any(a=>a.EmployeeId==e.Id && CoverageDemand.Covers(a,block.Start,block.End))).ToList();
            var slots=block.Rules.Where(r=>r.Scope!="team").SelectMany(r=>Enumerable.Repeat(r,r.MinimumEmployees)).ToList();
            var owners=new Dictionary<Guid,int>();
            bool Match(int slot,HashSet<Guid> visited) {
                foreach(Employee? employee in people.OrderByDescending(e=>e.Role==slots[slot].Role)) {
                    if(!ScheduleRules.CanCover(employee,slots[slot]) || !visited.Add(employee.Id))continue;
                    if(!owners.TryGetValue(employee.Id,out int previous) || Match(previous,visited)){owners[employee.Id]=slot;return true;}
                }
                return false;
            }
            for(int i =0;i<slots.Count;i++) Match(i,[]);
            var counts=owners.Values.GroupBy(i=>slots[i].Role).ToDictionary(g=>g.Key,g=>g.Count());
            foreach(Employee? person in people.Where(e=>!owners.ContainsKey(e.Id))) {
                CoverageRequirement? role =block.Rules.FirstOrDefault(r=>r.Scope!="team" && r.Role==person.Role) ?? block.Rules.FirstOrDefault(r=>r.Scope!="team" && ScheduleRules.CanCover(person,r));
                if(role is not null)counts[role.Role]=counts.GetValueOrDefault(role.Role)+1;
            }
            foreach(CoverageRequirement rule in block.Rules) {
                int assigned =rule.Scope=="team" ? people.Count : counts.GetValueOrDefault(rule.Role);
                yield return new(block.Start,block.End,rule.Role,rule.MinimumEmployees,assigned,assigned>=rule.MinimumEmployees ? "healthy" : assigned==0 ? "uncovered" : "warning");
            }
        }
    }

}
