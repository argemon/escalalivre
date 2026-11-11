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
        var timer = Stopwatch.StartNew();
        bool hasDurationChoice = context.PreferMinimumIntervals is not null;

        ScheduleOptimizationResult Search(double seconds) => context.ContractCredit is null && context.IntervalExtension is null
            ? reader.Read(context, execution.Solve(context.Model, seconds))
            : ScheduleObjectiveSearch.Solve(context, execution, reader, seconds);

        void Prepare(bool minimumOnly, bool unanticipatedOnly, ScheduleOptimizationResult? previous = null)
        {
            // Clear search-local objective locks as well as the previous preference assumptions.
            context.Model.ClearAssumptions();
            if (context.PreferMinimumIntervals is {} duration)
                context.Model.AddAssumption(minimumOnly ? duration : duration.Not());
            if (context.PreferUnanticipatedIntervals is {} timing)
                context.Model.AddAssumption(unanticipatedOnly ? timing : timing.Not());
            context.Model.ClearHints();
            if (previous is null) ScheduleSearchHints.Apply(context, minimumOnly);
            else
            {
                var selected = previous.SelectedAssignments.Concat(input.FixedCoverage).Select(a => a.Id).ToHashSet();
                foreach (var decision in context.DecisionVars)
                    context.Model.AddHint(decision.Value, selected.Contains(decision.Key) ? 1 : 0);
            }
        }

        ScheduleOptimizationResult SearchWithTiming(bool minimumOnly, double seconds)
        {
            var timingTimer = Stopwatch.StartNew();
            Prepare(minimumOnly, true);
            bool hasTimingChoice = context.PreferUnanticipatedIntervals is not null;
            var preferred = Search(hasTimingChoice ? seconds / 2 : seconds);
            if (!hasTimingChoice || !Succeeded(preferred) || Uncovered(request, preferred) == 0) return preferred;
            double remaining = seconds - timingTimer.Elapsed.TotalSeconds;
            if (remaining <= 0) return preferred;
            Prepare(minimumOnly, false, preferred);
            var relaxed = Search(remaining);
            if (!Succeeded(relaxed) || Uncovered(request, relaxed) >= Uncovered(request, preferred)) return preferred;
            return Explain(relaxed, "interval-anticipated-for-coverage", a =>
                IntervalTimingPolicy.IsEarly(request.Document.Company, a)
                && request.Document.Employees.First(e => e.Id == a.EmployeeId).FixedInterval is null
                && !input.RetainedInside.Any(h => h.Id == a.Id));
        }

        // Always obtain a minimum-duration incumbent before allowing longer automatic pauses.
        // All attempts share one model, one construction budget and five seconds of native search.
        var minimum = SearchWithTiming(true, hasDurationChoice ? OrToolsExecution.MaximumSeconds / 2 : OrToolsExecution.MaximumSeconds);
        if (!hasDurationChoice || !Succeeded(minimum) || Uncovered(request, minimum) == 0) return minimum;
        double remaining = OrToolsExecution.MaximumSeconds - timer.Elapsed.TotalSeconds;
        if (remaining <= 0) return minimum;
        var extended = SearchWithTiming(false, remaining);
        if (!Succeeded(extended) || Uncovered(request, extended) >= Uncovered(request, minimum)) return minimum;
        return Explain(extended, "interval-extended-for-coverage", a => context.IntervalExtensionSeconds.ContainsKey(a.Id));
    }

    private static bool Succeeded(ScheduleOptimizationResult result) => result.Status is "optimal" or "feasible";

    private static ScheduleOptimizationResult Explain(ScheduleOptimizationResult result, string tag, Func<ShiftAssignment, bool> applies)
    {
        var selected = result.SelectedAssignments.Select(a => a.Id).ToHashSet();
        ShiftAssignment Annotate(ShiftAssignment assignment) => selected.Contains(assignment.Id) && applies(assignment)
            ? assignment with { Tags = assignment.Tags.Append(tag).ToArray() } : assignment;
        return result with { Assignments = result.Assignments.Select(Annotate).ToArray(),
            SelectedAssignments = result.SelectedAssignments.Select(Annotate).ToArray() };
    }

    private static long Uncovered(ScheduleRequest request, ScheduleOptimizationResult result)
        => ScheduleCoverage.UncoveredPersonTicks(ScheduleCoverage.Evaluate(request.Document, request.Start, request.End, result.Assignments));
}
