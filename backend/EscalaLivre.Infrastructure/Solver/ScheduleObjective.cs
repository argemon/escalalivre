using EscalaLivre.Domain.Scheduling;
using Google.OrTools.Sat;

namespace EscalaLivre.Infrastructure.Solver;

public sealed class ScheduleObjective
{
    public static long ShortageWeight(TimeSpan block) => -(long)(block.TotalMinutes * 1_000_000_000);
    public static long OccupancyWeight(TimeSpan block) => (long)(block.TotalMinutes * 10_000);

    public static long CandidateWeight(CompanyRules company, Employee employee, ShiftAssignment candidate)
    {
        int preferenceWeight = employee.Preferences.Where(x => candidate.Tags.Contains(x.Code)).Sum(x => x.Weight);
        // Full civil elapsed time also handles pauses after midnight. A minute of delay
        // must remain visible and outweigh the small opening/closing tie breakers.
        long lunchDeviation = candidate.Break is null ? 0 : (long)Math.Ceiling(Math.Abs(
            (candidate.Break.Start - candidate.Start - company.Lunch.PreferredAfter).TotalSeconds));
        return -1_000_000 + Math.Clamp(preferenceWeight + (candidate.Tags.Contains("closing") ? 100 : 0), -1000L, 1000L) - 2 * lunchDeviation;
    }

    public void Apply(ScheduleModelContext context)
    {
        var request = context.Input.Request;
        var terms = context.Input.Candidates.Select(candidate => LinearExpr.Term(context.DecisionVars[candidate.Id],
            CandidateWeight(request.Document.Company, request.Document.Employees.First(e => e.Id == candidate.EmployeeId), candidate)));
        context.PreferenceObjective = LinearExpr.Sum(terms.Concat(context.OccupancyTerms));
        if (context.ContractCredit is not null || context.IntervalExtension is not null) context.Model.Minimize(LinearExpr.Sum(context.CoverageDeficitTerms));
        else context.Model.Maximize(LinearExpr.Sum(terms.Concat(context.ShortageTerms).Concat(context.OccupancyTerms)));
    }
}
