using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Scheduling;
using EscalaLivre.Domain.Scheduling;
using System.Diagnostics;

namespace EscalaLivre.Infrastructure.Solver;

public sealed class OrToolsScheduleOptimizer(ScheduleCandidateGenerator generator, ScheduleModelBuilder builder,
    OrToolsExecution execution, ScheduleResultReader reader) : IScheduleOptimizer
{
    public ScheduleOptimizationResult Optimize(ScheduleRequest request)
    {
        var budget = new OptimizationBudget();
        var input = new ScheduleModelInput(request, generator.Generate(request), budget);
        var context = builder.Build(input, budget);
        ScheduleOptimizationResult Search(double seconds) => context.ContractCredit is null ? reader.Read(context,execution.Solve(context.Model,seconds)) : ContractObjectiveSearch.Solve(context,execution,reader,seconds);
        var preference = context.PreferUnanticipatedIntervals;
        if (preference is null) return Search(OrToolsExecution.MaximumSeconds);

        // One model/budget and at most five seconds of native search across both attempts.
        context.Model.AddAssumption(preference);
        ScheduleSearchHints.Apply(context);
        var timer = Stopwatch.StartNew();
        var preferred = Search(OrToolsExecution.MaximumSeconds / 2);
        if (preferred.Status is not ("optimal" or "feasible")) return preferred;
        long uncovered = Uncovered(request, preferred);
        if (uncovered == 0) return preferred;

        context.Model.ClearAssumptions();
        context.Model.Add(preference == 0);
        // Reuse the already feasible assignment as a starting hint for the fallback.
        context.Model.ClearHints();
        var selectedIds = preferred.SelectedAssignments.Select(a => a.Id).ToHashSet();
        var fixedIds = input.FixedCoverage.Select(a => a.Id).ToHashSet();
        foreach (var decision in context.DecisionVars)
            context.Model.AddHint(decision.Value, selectedIds.Contains(decision.Key)
                || fixedIds.Contains(decision.Key) ? 1 : 0);
        double remaining = OrToolsExecution.MaximumSeconds - timer.Elapsed.TotalSeconds;
        if (remaining <= 0) return preferred;
        var relaxed = Search(remaining);
        if (relaxed.Status is not ("optimal" or "feasible") || Uncovered(request, relaxed) >= uncovered) return preferred;
        var early = relaxed.SelectedAssignments.Where(a => IntervalTimingPolicy.IsEarly(request.Document.Company, a)
            && request.Document.Employees.First(e => e.Id == a.EmployeeId).FixedInterval is null
            && !input.HolidayShifts.Any(h => h.Id == a.Id)).Select(a => a.Id).ToHashSet();
        ShiftAssignment Explain(ShiftAssignment a) => early.Contains(a.Id)
            ? a with { Tags = a.Tags.Append("interval-anticipated-for-coverage").ToArray() } : a;
        return relaxed with { Assignments = relaxed.Assignments.Select(Explain).ToArray(),
            SelectedAssignments = relaxed.SelectedAssignments.Select(Explain).ToArray() };
    }

    private static long Uncovered(ScheduleRequest request, ScheduleOptimizationResult result)
        => ScheduleCoverage.UncoveredPersonTicks(ScheduleCoverage.Evaluate(request.Document, request.Start, request.End, result.Assignments));
}
