using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Scheduling;
using EscalaLivre.Domain.Regimes;
using EscalaLivre.Domain.Scheduling;
using Google.OrTools.Sat;

namespace EscalaLivre.Infrastructure.Solver;

public sealed class OrToolsScheduleSolver : IScheduleSolver
{
    private readonly ShiftRegimeFactory regimeFactory = new();

    public ScheduleResult Solve(ScheduleRequest request)
    {
        var model = new CpModel();
        var candidates = BuildCandidates(request).ToList();
        var decisionVars = candidates.ToDictionary(x => x.Id, x => model.NewBoolVar($"assign_{x.Id:N}"));

        foreach (var employeeGroup in candidates.GroupBy(x => new { x.EmployeeId, Day = x.Start.Date }))
        {
            model.Add(LinearExpr.Sum(employeeGroup.Select(x => decisionVars[x.Id])) <= 1);
        }

        foreach (var coverage in request.Document.Company.Coverage)
        {
            foreach (var day in Days(request.Start, request.End).Where(x => x.DayOfWeek == coverage.Day))
            {
                var start = day.Add(coverage.Start.ToTimeSpan());
                var end = BuildEnd(day, coverage.Start, coverage.End);
                var covering = candidates
                    .Where(x => x.Role == coverage.Role && x.Start <= start && x.End >= end)
                    .Select(x => decisionVars[x.Id])
                    .ToArray();

                if (covering.Length > 0)
                {
                    model.Add(LinearExpr.Sum(covering) >= Math.Min(coverage.MinimumEmployees, covering.Length));
                }
            }
        }

        model.Maximize(LinearExpr.Sum(decisionVars.Values));
        var solver = new CpSolver
        {
            StringParameters = "max_time_in_seconds:5,num_search_workers:8"
        };
        solver.Solve(model);

        var assignments = candidates.Where(x => solver.Value(decisionVars[x.Id]) == 1).ToList();
        return BuildResult(request, assignments);
    }

    public ScheduleResult Validate(ScheduleRequest request)
        => BuildResult(request, request.Document.Assignments);

    public ScheduleResult Analyze(ScheduleRequest request)
        => BuildResult(request, request.Document.Assignments);

    private IEnumerable<ShiftAssignment> BuildCandidates(ScheduleRequest request)
    {
        foreach (var day in Days(request.Start, request.End))
        {
            if (!request.Document.Company.OperatingDays.Contains(day.DayOfWeek))
            {
                continue;
            }

            foreach (var employee in request.Document.Employees)
            {
                var rule = employee.InheritsCompanyDefaults ? request.Document.Company.DefaultWorkload : employee.Workload;
                var regime = regimeFactory.Resolve(rule.RegimeType);
                var start = day.Add(request.Document.Company.OpensAt.ToTimeSpan());
                var end = start.Add(rule.DefaultShiftDuration);
                if (request.Document.Company.ClosesAt > request.Document.Company.OpensAt && end.TimeOfDay > request.Document.Company.ClosesAt.ToTimeSpan())
                {
                    end = day.Add(request.Document.Company.ClosesAt.ToTimeSpan());
                }

                var employeeAssignments = request.Document.Assignments.Where(x => x.EmployeeId == employee.Id).ToList();
                if (!IsAvailable(employee, start, end) || !regime.CanWork(start, end, employeeAssignments, rule))
                {
                    continue;
                }

                var breakStart = start.Add(request.Document.Company.Lunch.PreferredAfter);
                var breakEnd = breakStart.Add(request.Document.Company.Lunch.Minimum);
                yield return new ShiftAssignment(Guid.NewGuid(), employee.Id, employee.Role, start, end, new BreakWindow(breakStart, breakEnd), "solver", []);
            }
        }
    }

    private ScheduleResult BuildResult(ScheduleRequest request, IReadOnlyList<ShiftAssignment> assignments)
    {
        var conflicts = DetectConflicts(request, assignments).ToList();
        var gaps = DetectGaps(request, assignments).ToList();
        var suggestions = gaps
            .GroupBy(x => x.Role)
            .Select(group => new HiringSuggestion(
                group.Key,
                Math.Min(44, group.Sum(x => (x.End - x.Start).TotalHours * x.MissingEmployees)),
                group.Select(x => new AvailabilityWindow(x.Start, x.End)).Take(7).ToList(),
                $"Cobertura insuficiente recorrente para {group.Key}."))
            .ToList();

        var requirementSlots = request.Document.Company.Coverage.Count * Math.Max(1, Days(request.Start, request.End).Count());
        var score = requirementSlots == 0 ? 1 : Math.Max(0, 1 - gaps.Count / (double)requirementSlots);
        return new ScheduleResult(assignments, conflicts, gaps, suggestions, Math.Round(score, 3));
    }

    private IEnumerable<ScheduleIssue> DetectConflicts(ScheduleRequest request, IReadOnlyList<ShiftAssignment> assignments)
    {
        foreach (var group in assignments.GroupBy(x => x.EmployeeId))
        {
            var ordered = group.OrderBy(x => x.Start).ToList();
            for (var i = 1; i < ordered.Count; i++)
            {
                if (ordered[i].Start - ordered[i - 1].End < request.Document.Company.MinimumRest)
                {
                    yield return new ScheduleIssue("error", "minimumRest", "Descanso minimo entre turnos foi violado.", ordered[i - 1].End, ordered[i].Start);
                }
            }
        }
    }

    private IEnumerable<CoverageGap> DetectGaps(ScheduleRequest request, IReadOnlyList<ShiftAssignment> assignments)
    {
        foreach (var requirement in request.Document.Company.Coverage)
        {
            foreach (var day in Days(request.Start, request.End).Where(x => x.DayOfWeek == requirement.Day))
            {
                var start = day.Add(requirement.Start.ToTimeSpan());
                var end = BuildEnd(day, requirement.Start, requirement.End);
                var covered = assignments.Count(x => x.Role == requirement.Role && x.Start <= start && x.End >= end);
                if (covered < requirement.MinimumEmployees)
                {
                    yield return new CoverageGap(start, end, requirement.Role, requirement.MinimumEmployees - covered);
                }
            }
        }
    }

    private static bool IsAvailable(Employee employee, DateTime start, DateTime end)
    {
        if (employee.Restrictions.Any(x => x.Start < end && start < x.End))
        {
            return false;
        }

        return employee.Availability.Count == 0 || employee.Availability.Any(x => x.Start <= start && x.End >= end);
    }

    private static DateTime BuildEnd(DateTime day, TimeOnly start, TimeOnly end)
    {
        var value = day.Add(end.ToTimeSpan());
        return end <= start ? value.AddDays(1) : value;
    }

    private static IEnumerable<DateTime> Days(DateTime start, DateTime end)
    {
        for (var day = start.Date; day < end.Date.AddDays(1); day = day.AddDays(1))
        {
            yield return day;
        }
    }
}
