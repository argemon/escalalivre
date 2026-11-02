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
        context.PreferenceObjective = LinearExpr.Sum(terms.Concat(context.OccupancyTerms));
        if (WeeklyWorkPlanPolicy.HasContractPlans(request.Document))
        {
            var credits = new List<LinearExpr>();
            foreach(var group in context.Input.Candidates.GroupBy(a=>(a.EmployeeId,Week:ScheduleWindow.WeekStart(a.Start))))
            {
                var employee=request.Document.Employees.First(e=>e.Id==group.Key.EmployeeId);
                var credit=LinearExpr.Sum(group.Select(a=>LinearExpr.Term(context.DecisionVars[a.Id],
                    ContractWorkPolicy.Recognized(request.Document.Company,employee,a.Start,EffectiveWorkPolicy.Measure(a).Ticks/TimeSpan.TicksPerSecond))));
                if(WeeklyWorkPlanPolicy.For(request.Document.Company,employee)?.FlexibleWorkDays is not null)
                {
                    var plan=WeeklyWorkPlanPolicy.For(request.Document.Company,employee)!;
                    long basic=plan.ContractedSeconds/plan.FlexibleWorkDays!.Value;
                    long Basis(ShiftAssignment a)=>Math.Min(ContractWorkPolicy.Recognized(request.Document.Company,employee,a.Start,EffectiveWorkPolicy.Measure(a).Ticks/TimeSpan.TicksPerSecond),
                        Math.Max(0,basic-ContractWorkPolicy.Excused(request.Document.Company,employee,a.Start)));
                    var baseline=LinearExpr.Sum(group.Select(a=>LinearExpr.Term(context.DecisionVars[a.Id],Basis(a))));
                    var extras=LinearExpr.Sum(group.Select(a=>LinearExpr.Term(context.DecisionVars[a.Id],Math.Min(1,
                        Math.Max(0,ContractWorkPolicy.Recognized(request.Document.Company,employee,a.Start,EffectiveWorkPolicy.Measure(a).Ticks/TimeSpan.TicksPerSecond)-Basis(a))))));
                    long extraBudget=FlexibleContractPolicy.ExtraSecondsInPeriod(request.Document.Company,employee,group.Key.Week,request.Start,request.End,context.Input.Preserved);
                    var extraCredit=context.Model.NewIntVar(0,extraBudget,"contract-remainder-"+group.Key.EmployeeId+group.Key.Week.Ticks);
                    context.Model.AddMinEquality(extraCredit,new LinearExpr[]{extras,LinearExpr.Constant(extraBudget)});
                    credit=baseline+extraCredit;
                    long target=FlexibleContractPolicy.ExpectedInPeriod(request.Document.Company,employee,group.Key.Week,request.Start,request.End,context.Input.Preserved);
                    var capped=context.Model.NewIntVar(0,target,"contract-credit-"+group.Key.EmployeeId+group.Key.Week.Ticks);
                    context.Model.AddMinEquality(capped,new LinearExpr[]{credit,LinearExpr.Constant(target)});
                    credits.Add(capped);
                }
                else credits.Add(credit);
            }
            context.ContractCredit = LinearExpr.Sum(credits);
            context.Model.Minimize(LinearExpr.Sum(context.CoverageDeficitTerms));
        }
        else context.Model.Maximize(LinearExpr.Sum(terms.Concat(context.ShortageTerms).Concat(context.OccupancyTerms)));
    }
}
