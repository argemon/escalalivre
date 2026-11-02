using System.Diagnostics;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Scheduling;
using EscalaLivre.Domain.Scheduling;
using Google.OrTools.Sat;

namespace EscalaLivre.Infrastructure.Solver;

// Exact priorities among found solutions; never sacrifice an earlier incumbent for a lower tier.
internal static class ContractObjectiveSearch
{
    internal static ScheduleOptimizationResult Solve(ScheduleModelContext context, OrToolsExecution execution, ScheduleResultReader reader, double seconds)
    {
        var timer = Stopwatch.StartNew();
        LinearExpr[] objectives = [LinearExpr.Sum(context.CoverageDeficitTerms), context.ContractCredit!, context.PreferenceObjective!];
        ScheduleOptimizationResult? best = null;
        bool proven = true;
        (long Uncovered,long Credit,long Preference)? bestScore = null;
        for (int phase = 0; phase < objectives.Length; phase++)
        {
            double remaining = seconds - timer.Elapsed.TotalSeconds;
            if (remaining <= 0) break;
            if (phase == 0) context.Model.Minimize(objectives[phase]); else context.Model.Maximize(objectives[phase]);
            var run = execution.Solve(context.Model, phase == 2 ? remaining : remaining * 0.8);
            if (run.Status is not (CpSolverStatus.Optimal or CpSolverStatus.Feasible))
                return best is null ? reader.Read(context,run) : best with { Status = "feasible" };
            proven &= run.Status == CpSolverStatus.Optimal;
            var candidate = reader.Read(context,run);
            var request=context.Input.Request;
            long uncovered=ScheduleCoverage.UncoveredPersonTicks(ScheduleCoverage.Evaluate(request.Document,request.Start,request.End,candidate.Assignments));
            long credit=ContractWorkPolicy.Summarize(request.Document,request.Start,request.End,candidate.Assignments)?.Sum(w=>w.RecognizedSeconds) ?? 0;
            long preference=run.Solver.Value(context.PreferenceObjective!);
            // A merely feasible run may not recover even the previous hint. Also, model
            // allocation may undercount actual coverage. Compare canonical incumbents.
            if (bestScore is {} previous && (uncovered>previous.Uncovered || (uncovered==previous.Uncovered
                && (credit<previous.Credit || (credit==previous.Credit && preference<previous.Preference)))))
                return best! with { Status="feasible" };
            bestScore=(uncovered,credit,preference);
            best = candidate with { Status = phase == 2 && proven ? "optimal" : "feasible" };
            // A conditional lock belongs to this attempt only. ClearAssumptions before the
            // early-lunch fallback releases these bounds, so coverage can improve there.
            var guard = context.Model.NewBoolVar($"contract_priority_{phase}_{Guid.NewGuid():N}");
            context.Model.Add(objectives[phase] == run.Solver.Value(objectives[phase])).OnlyEnforceIf(guard);
            context.Model.AddAssumption(guard);
            context.Model.ClearHints();
            foreach (var decision in context.DecisionVars) context.Model.AddHint(decision.Value,run.Solver.Value(decision.Value));
        }
        return best ?? reader.Read(context,new(CpSolverStatus.Unknown,new CpSolver()));
    }
}
