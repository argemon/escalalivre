using EscalaLivre.Domain.Scheduling;
using Google.OrTools.Sat;

namespace EscalaLivre.Infrastructure.Solver;

public sealed class ContractWorkConstraints : IScheduleConstraintTranslator
{
    public void Apply(ScheduleModelContext context, OptimizationBudget budget)
    {
        var input = context.Input;
        var request = input.Request;
        if (!WeeklyWorkPlanPolicy.HasContractPlans(request.Document)) return;
        if (ContractMinimumPolicy.ConfigurationIssues(request.Document,request.Start,request.End).Count > 0)
            context.Model.Add(LinearExpr.Constant(0) == 1);
        var credits = new List<LinearExpr>();
        var summaries = ContractWorkPolicy.Summarize(request.Document, request.Start, request.End, input.Preserved)!;
        var requirements = ContractMinimumPolicy.Requirements(request.Document, request.Start, request.End, input.Preserved);
        var groups = input.Candidates.ToLookup(a => (a.EmployeeId, Week: ScheduleWindow.WeekStart(a.Start)));
        foreach (var minimum in requirements)
        {
            budget.Spend();
            var employee = request.Document.Employees.First(e => e.Id == minimum.EmployeeId);
            var plan = WeeklyWorkPlanPolicy.For(request.Document.Company, employee)!;
            var group = groups[(minimum.EmployeeId, minimum.WeekStart)].ToArray();
            long Recognized(ShiftAssignment a) => ContractWorkPolicy.Recognized(request.Document.Company, employee, a.Start,
                EffectiveWorkPolicy.Measure(a).Ticks / TimeSpan.TicksPerSecond);
            LinearExpr credit = LinearExpr.Sum(group.Select(a => LinearExpr.Term(context.DecisionVars[a.Id], Recognized(a))));
            if (plan.FlexibleWorkDays is {} days)
            {
                long basic = plan.ContractedSeconds / days;
                long Basis(ShiftAssignment a) => Math.Min(Recognized(a),
                    Math.Max(0, basic - ContractWorkPolicy.Excused(request.Document.Company, employee, a.Start)));
                var baseline = LinearExpr.Sum(group.Select(a => LinearExpr.Term(context.DecisionVars[a.Id], Basis(a))));
                var extras = LinearExpr.Sum(group.Select(a => LinearExpr.Term(context.DecisionVars[a.Id],
                    Math.Min(1, Math.Max(0, Recognized(a) - Basis(a))))));
                long extraBudget = FlexibleContractPolicy.ExtraSecondsInPeriod(request.Document.Company, employee,
                    minimum.WeekStart, request.Start, request.End, input.Preserved);
                var extraCredit = context.Model.NewIntVar(0, extraBudget, $"contract-remainder-{minimum.EmployeeId}-{minimum.WeekStart.Ticks}");
                context.Model.AddMinEquality(extraCredit, new LinearExpr[] { extras, LinearExpr.Constant(extraBudget) });
                credit = baseline + extraCredit;
                long target = summaries.First(s => s.EmployeeId == minimum.EmployeeId && s.WeekStart == minimum.WeekStart).ExpectedSeconds;
                var capped = context.Model.NewIntVar(0, target, $"contract-credit-{minimum.EmployeeId}-{minimum.WeekStart.Ticks}");
                context.Model.AddMinEquality(capped, new LinearExpr[] { credit, LinearExpr.Constant(target) });
                credit = capped;
            }
            context.Model.Add(credit >= minimum.RequiredSeconds);
            credits.Add(credit);
        }
        context.ContractCredit = LinearExpr.Sum(credits);
    }
}
