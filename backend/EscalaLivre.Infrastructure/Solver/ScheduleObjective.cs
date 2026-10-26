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
        double lunchBalance = candidate.Break is null ? 0 : -Math.Abs((candidate.Break.Start.TimeOfDay
            - (candidate.Start.TimeOfDay + company.Lunch.PreferredAfter)).TotalMinutes) / 30;
        return -1_000_000 + Math.Clamp(preferenceWeight + (long)lunchBalance + (candidate.Tags.Contains("closing") ? 100 : 0), -1000L, 1000L);
    }

    public void Apply(ScheduleModelContext context)
    {
        var request = context.Input.Request;
        var terms = context.Input.Candidates.Select(candidate => LinearExpr.Term(context.DecisionVars[candidate.Id],
            CandidateWeight(request.Document.Company, request.Document.Employees.First(e => e.Id == candidate.EmployeeId), candidate)));
        context.Model.Maximize(LinearExpr.Sum(terms.Concat(context.ShortageTerms).Concat(context.OccupancyTerms)));
    }
}
