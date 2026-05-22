using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Scheduling;
using EscalaLivre.Domain.Regimes;
using EscalaLivre.Domain.Scheduling;
using Google.OrTools.Sat;

namespace EscalaLivre.Infrastructure.Solver;

public sealed class OrToolsScheduleSolver : IScheduleSolver
{
    private readonly ShiftRegimeFactory regimeFactory = new();
    private static readonly TimeSpan CoverageBlockSize = TimeSpan.FromHours(1);
    private static readonly TimeSpan BreakSearchStep = TimeSpan.FromMinutes(30);

    public ScheduleResult Solve(ScheduleRequest request)
    {
        var model = new CpModel();
        var candidates = BuildCandidates(request).ToList();
        var decisionVars = candidates.ToDictionary(x => x.Id, x => model.NewBoolVar($"assign_{x.Id:N}"));

        foreach (var employeeGroup in candidates.GroupBy(x => new { x.EmployeeId, Day = x.Start.Date }))
        {
            model.Add(LinearExpr.Sum(employeeGroup.Select(x => decisionVars[x.Id])) <= 1);
        }

        foreach (var employeeWeek in candidates.GroupBy(x => new { x.EmployeeId, Week = WeekStart(x.Start) }))
        {
            var employee = request.Document.Employees.First(x => x.Id == employeeWeek.Key.EmployeeId);
            var rule = employee.InheritsCompanyDefaults ? request.Document.Company.DefaultWorkload : employee.Workload;
            var weightedHours = employeeWeek.Select(x => (LinearExpr.Term(decisionVars[x.Id], (long)Math.Round((x.End - x.Start).TotalMinutes))));
            model.Add(LinearExpr.Sum(weightedHours) <= (long)Math.Round(rule.WeeklyLimitHours * 60));
        }

        foreach (var coverage in request.Document.Company.Coverage)
        {
            foreach (var day in Days(request.Start, request.End).Where(x => x.DayOfWeek == coverage.Day))
            {
                var start = day.Add(coverage.Start.ToTimeSpan());
                var end = BuildEnd(day, coverage.Start, coverage.End);
                foreach (var block in Blocks(start, end))
                {
                    var covering = candidates
                        .Where(x => Covers(x, block.Start, block.End) && x.Role == coverage.Role)
                        .Select(x => decisionVars[x.Id])
                        .ToArray();

                    if (covering.Length >= coverage.MinimumEmployees)
                    {
                        model.Add(LinearExpr.Sum(covering) >= coverage.MinimumEmployees);
                    }
                }
            }
        }

        var objectiveTerms = candidates.Select(candidate =>
        {
            var employee = request.Document.Employees.First(x => x.Id == candidate.EmployeeId);
            var preferenceWeight = employee.Preferences.Where(x => candidate.Tags.Contains(x.Code)).Sum(x => x.Weight);
            var lunchBalance = candidate.Break is null ? 0 : -Math.Abs((candidate.Break.Start.TimeOfDay - TimeSpan.FromHours(12)).TotalMinutes) / 30;
            return LinearExpr.Term(decisionVars[candidate.Id], 100 + preferenceWeight + (long)lunchBalance);
        });
        model.Maximize(LinearExpr.Sum(objectiveTerms));

        var solver = new CpSolver
        {
            StringParameters = "max_time_in_seconds:5,num_search_workers:8"
        };
        var status = solver.Solve(model);

        if (status is CpSolverStatus.Infeasible or CpSolverStatus.ModelInvalid)
        {
            var result = BuildResult(request, request.Document.Assignments);
            return result with
            {
                Conflicts = result.Conflicts.Concat(
                [
                    new ScheduleIssue("error", "solverInfeasible", "Nenhuma escala satisfaz todas as restricoes obrigatorias no periodo informado.", request.Start, request.End)
                ]).ToList()
            };
        }

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

                foreach (var breakWindow in BuildBreakWindows(start, end, request.Document.Company.Lunch))
                {
                    var tags = new List<string>();
                    if (employee.PreferredDaysOff.Contains(day.DayOfWeek))
                    {
                        tags.Add("preferredDayOff");
                    }

                    if (start.Hour < 6 || end.Hour >= 22 || end.Date > start.Date)
                    {
                        tags.Add("night");
                    }

                    yield return new ShiftAssignment(Guid.NewGuid(), employee.Id, employee.Role, start, end, breakWindow, "solver", tags);
                }
            }
        }
    }

    private ScheduleResult BuildResult(ScheduleRequest request, IReadOnlyList<ShiftAssignment> assignments)
    {
        var conflicts = DetectConflicts(request, assignments).ToList();
        var coverage = BuildCoverage(request, assignments).ToList();
        var gaps = coverage
            .Where(x => x.Assigned < x.Required)
            .Select(x => new CoverageGap(x.Start, x.End, x.Role, x.Required - x.Assigned))
            .ToList();
        var suggestions = gaps
            .GroupBy(x => x.Role)
            .Select(group => new HiringSuggestion(
                group.Key,
                Math.Min(44, group.Sum(x => (x.End - x.Start).TotalHours * x.MissingEmployees)),
                group.Select(x => new AvailabilityWindow(x.Start, x.End)).Take(7).ToList(),
                $"Cobertura insuficiente recorrente para {group.Key}."))
            .ToList();

        var optimizationSuggestions = BuildOptimizationSuggestions(assignments, coverage).ToList();
        var decisions = BuildDecisions(request, assignments).ToList();
        var requiredMinutes = coverage.Sum(x => Math.Max(0, x.Required) * (x.End - x.Start).TotalMinutes);
        var coveredMinutes = coverage.Sum(x => Math.Min(x.Required, x.Assigned) * (x.End - x.Start).TotalMinutes);
        var score = requiredMinutes == 0 ? 1 : Math.Max(0, coveredMinutes / requiredMinutes);
        return new ScheduleResult(assignments, conflicts, coverage, gaps, suggestions, optimizationSuggestions, decisions, Math.Round(score, 3));
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

    private IEnumerable<CoverageBlock> BuildCoverage(ScheduleRequest request, IReadOnlyList<ShiftAssignment> assignments)
    {
        foreach (var requirement in request.Document.Company.Coverage)
        {
            foreach (var day in Days(request.Start, request.End).Where(x => x.DayOfWeek == requirement.Day))
            {
                var start = day.Add(requirement.Start.ToTimeSpan());
                var end = BuildEnd(day, requirement.Start, requirement.End);
                foreach (var block in Blocks(start, end))
                {
                    var assigned = assignments.Count(x => x.Role == requirement.Role && Covers(x, block.Start, block.End));
                    var state = assigned >= requirement.MinimumEmployees ? "healthy" : assigned + 1 >= requirement.MinimumEmployees ? "warning" : "uncovered";
                    yield return new CoverageBlock(block.Start, block.End, requirement.Role, requirement.MinimumEmployees, assigned, state);
                }
            }
        }
    }

    private static IEnumerable<OptimizationSuggestion> BuildOptimizationSuggestions(IReadOnlyList<ShiftAssignment> assignments, IReadOnlyList<CoverageBlock> coverage)
    {
        foreach (var gap in coverage.Where(x => x.State == "uncovered").Take(8))
        {
            var movableBreak = assignments.FirstOrDefault(x =>
                x.Role == gap.Role &&
                x.Start <= gap.Start &&
                x.End >= gap.End &&
                x.Break is not null &&
                x.Break.Start < gap.End &&
                gap.Start < x.Break.End);

            if (movableBreak is not null)
            {
                yield return new OptimizationSuggestion(
                    "moveBreak",
                    $"Mover ou estender o almoco de {movableBreak.Role} reduz o buraco entre {gap.Start:HH\\h} e {gap.End:HH\\h}.",
                    "Recupera cobertura sem adicionar turno.",
                    movableBreak.EmployeeId,
                    gap.Start,
                    gap.End);
            }
        }
    }

    private static IEnumerable<SolverDecision> BuildDecisions(ScheduleRequest request, IReadOnlyList<ShiftAssignment> assignments)
    {
        foreach (var assignment in assignments.Take(1000))
        {
            var employee = request.Document.Employees.FirstOrDefault(x => x.Id == assignment.EmployeeId);
            var factors = new List<string>
            {
                $"cobertura minima de {assignment.Role} requerida",
                "respeita disponibilidade e restricoes individuais",
                "mantem descanso minimo e limite semanal"
            };

            if (assignment.Break is not null)
            {
                factors.Add($"intervalo otimizado entre {assignment.Break.Start:HH\\hmm} e {assignment.Break.End:HH\\hmm}");
            }

            yield return new SolverDecision(
                assignment.Id,
                assignment.EmployeeId,
                $"{employee?.Name ?? assignment.EmployeeId.ToString()} alocado para proteger a cobertura operacional de {assignment.Role}.",
                factors);
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

    private static bool Covers(ShiftAssignment assignment, DateTime start, DateTime end)
    {
        if (assignment.Start > start || assignment.End < end)
        {
            return false;
        }

        return assignment.Break is null || assignment.Break.End <= start || assignment.Break.Start >= end;
    }

    private static IEnumerable<BreakWindow?> BuildBreakWindows(DateTime shiftStart, DateTime shiftEnd, LunchRule lunch)
    {
        var duration = shiftEnd - shiftStart;
        if (duration < TimeSpan.FromHours(6) || lunch.Minimum == TimeSpan.Zero)
        {
            yield return null;
            yield break;
        }

        var earliest = shiftStart.Add(TimeSpan.FromHours(3));
        var latestStart = shiftEnd.Subtract(TimeSpan.FromHours(2)).Subtract(lunch.Minimum);
        var preferred = shiftStart.Add(lunch.PreferredAfter);
        var starts = new SortedSet<DateTime> { Clamp(preferred, earliest, latestStart) };

        for (var cursor = earliest; cursor <= latestStart; cursor = cursor.Add(BreakSearchStep))
        {
            starts.Add(cursor);
        }

        foreach (var start in starts.Take(10))
        {
            yield return new BreakWindow(start, start.Add(lunch.Minimum));
            if (lunch.Maximum > lunch.Minimum && start.Add(lunch.Maximum) <= shiftEnd.Subtract(TimeSpan.FromHours(1)))
            {
                yield return new BreakWindow(start, start.Add(lunch.Maximum));
            }
        }
    }

    private static DateTime Clamp(DateTime value, DateTime min, DateTime max)
        => value < min ? min : value > max ? max : value;

    private static DateTime WeekStart(DateTime value)
        => value.Date.AddDays(-(int)value.DayOfWeek);

    private static IEnumerable<(DateTime Start, DateTime End)> Blocks(DateTime start, DateTime end)
    {
        for (var cursor = start; cursor < end; cursor = cursor.Add(CoverageBlockSize))
        {
            yield return (cursor, cursor.Add(CoverageBlockSize) > end ? end : cursor.Add(CoverageBlockSize));
        }
    }

    private static IEnumerable<DateTime> Days(DateTime start, DateTime end)
    {
        for (var day = start.Date; day < end.Date.AddDays(1); day = day.AddDays(1))
        {
            yield return day;
        }
    }
}
