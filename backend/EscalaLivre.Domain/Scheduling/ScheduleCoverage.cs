namespace EscalaLivre.Domain.Scheduling;

public sealed record CoverageAssessment(IReadOnlyList<CoverageBlock> Blocks, IReadOnlyList<CoverageGap> Gaps, double Score);

public static class ScheduleCoverage
{
    public static long UncoveredPersonTicks(CoverageAssessment assessment)
        => assessment.Blocks.Sum(b => checked(Math.Max(0, b.Required - b.Assigned) * (b.End - b.Start).Ticks));

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
        // Retain the caller's employee order and every shift (including overlapping history).
        // Index only ownership; eligibility and pause boundaries remain canonical per block.
        var byEmployee = assignments.ToLookup(a => a.EmployeeId);
        foreach((DateTime Start, DateTime End, List<CoverageRequirement> Rules) block in CoverageDemand.Blocks(document.Company,start,end,assignments)) {
            var people=document.Employees.Where(e=>byEmployee[e.Id].Any(a=>CoverageDemand.Covers(a,block.Start,block.End))).ToList();
            foreach(CoverageRequirement rule in block.Rules) {
                int assigned =people.Count(e => ScheduleRules.CanCover(e, rule, document.Roles));
                yield return new(block.Start,block.End,rule.Role,rule.MinimumEmployees,assigned,assigned>=rule.MinimumEmployees ? "healthy" : assigned==0 ? "uncovered" : "warning");
            }
        }
    }

}
