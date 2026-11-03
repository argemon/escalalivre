using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Infrastructure.Solver;

// A starting suggestion only: CP-SAT must still satisfy every registered constraint.
internal static class ScheduleSearchHints
{
    internal static void Apply(ScheduleModelContext context, bool minimumOnly = false)
    {
        var input = context.Input;
        var company = input.Request.Document.Company;
        var chosen = input.HolidayShifts.Concat(input.FixedCoverage).Select(a => a.Id).ToHashSet();
        foreach (var week in input.Candidates.GroupBy(a => ScheduleWindow.WeekStart(a.Start)))
        {
            var lunches = new List<(TimeSpan Start, TimeSpan End)>();
            foreach (var employee in input.Request.Document.Employees)
            {
                var routines = week.Where(a => a.EmployeeId == employee.Id
                        && (!minimumOnly || !context.IntervalExtensionSeconds.ContainsKey(a.Id))
                        && (employee.FixedInterval is not null || !IntervalTimingPolicy.IsEarly(company, a)))
                    .GroupBy(a => (Start: a.Start.TimeOfDay, End: WeeklyWorkPlanPolicy.For(company,employee) is null ? a.End - a.Start.Date : TimeSpan.Zero, Pause: WeeklyIntervalPolicy.Pattern(a)))
                    .OrderByDescending(g => g.Select(a => a.Start.Date).Distinct().Count())
                    .ThenByDescending(g => WeeklyWorkPlanPolicy.For(company,employee) is null ? 0 : g.Sum(a=>ContractWorkPolicy.Recognized(company,employee,a.Start,EffectiveWorkPolicy.Measure(a).Ticks/TimeSpan.TicksPerSecond)))
                    .ThenBy(g => g.Sum(a => context.IntervalExtensionSeconds.GetValueOrDefault(a.Id)))
                    .ThenByDescending(g => g.Max(a=>a.End-a.Start))
                    .ThenBy(g => g.Key.Pause is {} pause ? lunches.Sum(other =>
                        Math.Max(0, (Math.Min((pause.Start + pause.Duration).Ticks, other.End.Ticks)
                            - Math.Max(pause.Start.Ticks, other.Start.Ticks)))) : 0)
                    .ThenBy(g => g.Key.Pause is {} pause ? Math.Abs((pause.Start - g.Key.Start - company.Lunch.PreferredAfter).Ticks) : 0)
                    .ThenBy(g => g.Key.Start);
                var routine = routines.FirstOrDefault();
                if (routine is null) continue;
                foreach (var day in routine.GroupBy(a => a.Start.Date)) chosen.Add(day.OrderByDescending(a=>EffectiveWorkPolicy.Measure(a)).First().Id);
                if (routine.Key.Pause is {} selected) lunches.Add((selected.Start, selected.Start + selected.Duration));
            }
        }
        foreach (var decision in context.DecisionVars) context.Model.AddHint(decision.Value, chosen.Contains(decision.Key) ? 1 : 0);
    }
}
