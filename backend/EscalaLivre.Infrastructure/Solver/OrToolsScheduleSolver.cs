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

        foreach (var group in candidates.GroupBy(x => x.EmployeeId))
        {
            var employee = request.Document.Employees.First(x => x.Id == group.Key);
            var rule = employee.InheritsCompanyDefaults ? request.Document.Company.DefaultWorkload : employee.Workload;
            var rest = RequiredRest(request, rule);
            var ordered = group.OrderBy(x => x.Start).ToList();
            for (var i = 0; i < ordered.Count; i++)
            for (var j = i + 1; j < ordered.Count && ordered[j].Start < ordered[i].End + rest; j++)
                model.Add(decisionVars[ordered[i].Id] + decisionVars[ordered[j].Id] <= 1);
        }

        foreach (var employeeWeek in candidates.GroupBy(x => new { x.EmployeeId, Week = WeekStart(x.Start) }))
        {
            var employee = request.Document.Employees.First(x => x.Id == employeeWeek.Key.EmployeeId);
            var rule = employee.InheritsCompanyDefaults ? request.Document.Company.DefaultWorkload : employee.Workload;
            var weightedHours = employeeWeek.Select(x => (LinearExpr.Term(decisionVars[x.Id], (long)Math.Round(WorkMinutes(x)))));
            model.Add(LinearExpr.Sum(weightedHours) <= (long)Math.Round(rule.WeeklyLimitHours * 60));
        }

        foreach (var group in candidates.GroupBy(x => x.EmployeeId))
        {
            var employee = request.Document.Employees.First(x => x.Id == group.Key);
            var rule = employee.InheritsCompanyDefaults ? request.Document.Company.DefaultWorkload : employee.Workload;
            if (rule.RegimeType != "dayBased") continue;
            var cycle = Math.Max(1, rule.WorkUnits + rule.RestUnits);
            foreach (var lastDay in Days(request.Start, request.End.AddDays(cycle - 1)))
            {
                var firstDay = lastDay.AddDays(1 - cycle);
                var before = request.Document.Assignments.Where(a => a.EmployeeId == employee.Id && a.Start.Date < request.Start.Date && a.Start.Date >= firstDay && a.Start.Date <= lastDay).Select(a => a.Start.Date).Distinct().Count();
                model.Add(LinearExpr.Sum(group.Where(a => a.Start.Date >= firstDay && a.Start.Date <= lastDay).Select(a => decisionVars[a.Id])) <= Math.Max(0, rule.WorkUnits - before));
            }
        }

        var shortageTerms = new List<LinearExpr>();
        foreach (var coverage in request.Document.Company.Coverage)
        {
            foreach (var day in Days(request.Start, request.End).Where(x => x.DayOfWeek == coverage.Day))
            {
                var start = day.Add(coverage.Start.ToTimeSpan());
                var end = BuildEnd(day, coverage.Start, coverage.End);
                foreach (var block in CoverageBlocks(start, end, request.Document.Company, coverage.AllowsOutsideHours, candidates))
                {
                    var covering = candidates
                        .Where(x => Covers(x, block.Start, block.End) && x.Role == coverage.Role)
                        .Select(x => decisionVars[x.Id])
                        .ToArray();

                    var shortage = model.NewIntVar(0, coverage.MinimumEmployees, $"shortage_{shortageTerms.Count}");
                    model.Add(LinearExpr.Sum(covering) + shortage >= coverage.MinimumEmployees);
                    shortageTerms.Add(LinearExpr.Term(shortage, -(long)((block.End - block.Start).TotalMinutes * 1_000_000_000)));
                }
            }
        }

        var objectiveTerms = candidates.Select(candidate =>
        {
            var employee = request.Document.Employees.First(x => x.Id == candidate.EmployeeId);
            var preferenceWeight = employee.Preferences.Where(x => candidate.Tags.Contains(x.Code)).Sum(x => x.Weight);
            var lunchBalance = candidate.Break is null ? 0 : -Math.Abs((candidate.Break.Start.TimeOfDay - TimeSpan.FromHours(12)).TotalMinutes) / 30;
            return LinearExpr.Term(decisionVars[candidate.Id], -1_000_000 + Math.Clamp(preferenceWeight + (long)lunchBalance, -1000L, 1000L));
        });
        model.Maximize(LinearExpr.Sum(objectiveTerms.Concat(shortageTerms)));

        var solver = new CpSolver
        {
            StringParameters = "max_time_in_seconds:5,num_search_workers:8"
        };
        var status = solver.Solve(model);

        if (status is not (CpSolverStatus.Feasible or CpSolverStatus.Optimal))
        {
            var result = BuildResult(request, []);
            return result with
            {
                Conflicts = result.Conflicts.Concat(
                [
                    new ScheduleIssue("error", status == CpSolverStatus.Unknown ? "solverTimeout" : "solverInfeasible", status == CpSolverStatus.Unknown ? "O limite de tempo terminou sem uma escala viavel." : "Nenhuma escala satisfaz todas as restricoes obrigatorias no periodo informado.", request.Start, request.End)
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


            foreach (var employee in request.Document.Employees)
            {
                if (!employee.InheritsCompanyDefaults && employee.WorkingDays is { } days && !days.Contains(day.DayOfWeek)) continue;
                var rule = employee.InheritsCompanyDefaults ? request.Document.Company.DefaultWorkload : employee.Workload;
                var regime = regimeFactory.Resolve(rule.RegimeType);
                var windows = new List<(DateTime Start, DateTime End)>();
                if (request.Document.Company.OperatingDays.Contains(day.DayOfWeek)) windows.Add((day.Add(request.Document.Company.OpensAt.ToTimeSpan()), BuildEnd(day, request.Document.Company.OpensAt, request.Document.Company.ClosesAt)));
                windows.AddRange(request.Document.Company.Coverage.Where(c => c.AllowsOutsideHours && c.Role == employee.Role && c.Day == day.DayOfWeek).Select(c => (day.Add(c.Start.ToTimeSpan()), BuildEnd(day,c.Start,c.End))));
                foreach (var window in windows.Distinct()) {
                var opening = window.Start;
                var closing = window.End;
                var shiftDuration = rule.DefaultShiftDuration < closing - opening ? rule.DefaultShiftDuration : closing - opening;
                if (shiftDuration <= TimeSpan.Zero) continue;
                var starts = new SortedSet<DateTime> { opening, closing - shiftDuration };
                for (var cursor = opening; cursor + shiftDuration <= closing; cursor = cursor.AddMinutes(30)) starts.Add(cursor);
                foreach (var available in employee.Availability) if (available.Start >= opening && available.Start + shiftDuration <= closing) starts.Add(available.Start);
                foreach (var start in starts)
                {
                var end = start.Add(shiftDuration);
                if (rule.RegimeType == "hourBased" && end - start > TimeSpan.FromHours(rule.WorkUnits)) continue;
                if (!employee.AllowsNightWork && IsNight(start, end)) continue;

                // Generation replaces the requested period; previous assignments must not block regeneration.
                var employeeAssignments = request.Document.Assignments.Where(x => x.EmployeeId == employee.Id && x.Start.Date < request.Start.Date).ToList();
                if (!IsAvailable(employee, start, end)
                    || employeeAssignments.Any(x => start < x.End + RequiredRest(request, rule) && x.Start < end)
                    || !regime.CanWork(start, end, [], rule))
                {
                    continue;
                }

                var closure = ClosureOn(request.Document.Company, day);
                var exceptional = request.Document.Company.Coverage.Any(c => c.AllowsOutsideHours && c.Role == employee.Role && c.Day == day.DayOfWeek && start >= day.Add(c.Start.ToTimeSpan()) && end <= BuildEnd(day, c.Start, c.End));
                foreach (var breakWindow in BuildBreakWindows(start, end, request.Document.Company.Lunch, exceptional ? null : closure))
                {
                    var tags = new List<string>();
                    if (start == opening) tags.Add("opening");
                    if (end == closing) tags.Add("closing");
                    if (start.Hour < 12) tags.Add("morning");
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
        foreach (var assignment in assignments)
        {
            var employee = request.Document.Employees.FirstOrDefault(x => x.Id == assignment.EmployeeId);
            if (employee is null)
            {
                yield return new ScheduleIssue("error", "unknownEmployee", "Turno referencia funcionario inexistente.", assignment.Start, assignment.End);
                continue;
            }
            if ((!employee.InheritsCompanyDefaults && employee.WorkingDays is { } workingDays && !workingDays.Contains(assignment.Start.DayOfWeek)) || (!request.Document.Company.OperatingDays.Contains(assignment.Start.DayOfWeek) && !request.Document.Company.Coverage.Any(c => c.AllowsOutsideHours && c.Role == assignment.Role && c.Day == assignment.Start.DayOfWeek && assignment.Start >= assignment.Start.Date.Add(c.Start.ToTimeSpan()) && assignment.End <= BuildEnd(assignment.Start.Date,c.Start,c.End))))
                yield return new ScheduleIssue("error", "workingDay", "Turno fora dos dias de trabalho.", assignment.Start, assignment.End);
            var rule = employee.InheritsCompanyDefaults ? request.Document.Company.DefaultWorkload : employee.Workload;
            if (assignment.End <= assignment.Start || assignment.Role != employee.Role || !IsAvailable(employee, assignment.Start, assignment.End))
                yield return new ScheduleIssue("error", "invalidShift", "Turno invalido ou fora da disponibilidade.", assignment.Start, assignment.End);
            if (!employee.AllowsNightWork && IsNight(assignment.Start, assignment.End))
                yield return new ScheduleIssue("error", "nightWork", "Funcionario nao permite trabalho noturno.", assignment.Start, assignment.End);
            if (!regimeFactory.Resolve(rule.RegimeType).CanWork(assignment.Start, assignment.End, assignments.Where(a => a.EmployeeId == employee.Id && a.Id != assignment.Id && a.Start < assignment.Start).ToList(), rule))
                yield return new ScheduleIssue("error", "regime", "Turno viola o regime configurado.", assignment.Start, assignment.End);
            if (assignment.Break is { } pause && (pause.Start < assignment.Start || pause.End > assignment.End || pause.End <= pause.Start))
                yield return new ScheduleIssue("error", "invalidBreak", "Intervalo fora do turno ou com duracao invalida.", assignment.Start, assignment.End);
        }
        foreach (var group in assignments.GroupBy(x => x.EmployeeId))
        {
            var employee = request.Document.Employees.FirstOrDefault(x => x.Id == group.Key);
            if (employee is null) continue;
            var rule = employee.InheritsCompanyDefaults ? request.Document.Company.DefaultWorkload : employee.Workload;
            var ordered = group.OrderBy(x => x.Start).ToList();
            for (var i = 1; i < ordered.Count; i++)
                if (ordered[i].Start - ordered[i - 1].End < RequiredRest(request, rule))
                    yield return new ScheduleIssue("error", "minimumRest", "Descanso minimo entre turnos foi violado.", ordered[i - 1].End, ordered[i].Start);
            foreach (var week in ordered.GroupBy(x => WeekStart(x.Start)))
                if (week.Sum(WorkMinutes) > rule.WeeklyLimitHours * 60)
                    yield return new ScheduleIssue("error", "weeklyLimit", "Limite semanal foi excedido.", week.Key, week.Key.AddDays(7));
        }
    }

    private static double WorkMinutes(ShiftAssignment assignment)
        => (assignment.End - assignment.Start).TotalMinutes - (assignment.Break is null ? 0 : (assignment.Break.End - assignment.Break.Start).TotalMinutes);

    private static TimeSpan RequiredRest(ScheduleRequest request, WorkloadRule rule)
        => rule.RegimeType == "hourBased" && TimeSpan.FromHours(rule.RestUnits) > request.Document.Company.MinimumRest
            ? TimeSpan.FromHours(rule.RestUnits) : request.Document.Company.MinimumRest;

    private static bool IsNight(DateTime start, DateTime end)
        => start.Hour < 6 || end > start.Date.AddHours(22);

    private IEnumerable<CoverageBlock> BuildCoverage(ScheduleRequest request, IReadOnlyList<ShiftAssignment> assignments)
    {
        foreach (var requirement in request.Document.Company.Coverage)
        {
            foreach (var day in Days(request.Start, request.End).Where(x => x.DayOfWeek == requirement.Day))
            {
                var start = day.Add(requirement.Start.ToTimeSpan());
                var end = BuildEnd(day, requirement.Start, requirement.End);
                foreach (var block in CoverageBlocks(start, end, request.Document.Company, requirement.AllowsOutsideHours, assignments))
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

    private static IEnumerable<BreakWindow?> BuildBreakWindows(DateTime shiftStart, DateTime shiftEnd, LunchRule lunch, BreakWindow? closure = null)
    {
        var duration = shiftEnd - shiftStart;
        if (closure is not null && shiftStart < closure.End && shiftEnd > closure.Start)
        {
            var start = shiftStart > closure.Start ? shiftStart : closure.Start;
            var end = shiftEnd < closure.End ? shiftEnd : closure.End;
            if (end - start >= duration) yield break;
            if (duration >= TimeSpan.FromHours(6) && end - start < lunch.Minimum) yield break;
            yield return new BreakWindow(start, end);
            yield break;
        }
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

    private static BreakWindow? ClosureOn(CompanyRules company, DateTime day)
    {
        if (company.MiddayClosure is not { } closure) return null;
        var opening = day.Date.Add(company.OpensAt.ToTimeSpan());
        var start = day.Date.Add(closure.Start.ToTimeSpan());
        if (start < opening) start = start.AddDays(1);
        var end = start.Date.Add(closure.End.ToTimeSpan());
        if (end <= start) end = end.AddDays(1);
        return new BreakWindow(start, end);
    }

    private static IEnumerable<(DateTime Start, DateTime End)> CoverageBlocks(DateTime start, DateTime end, CompanyRules company, bool allowsOutsideHours, IReadOnlyList<ShiftAssignment> shifts)
    {
        var points = new SortedSet<DateTime> { start, end };
        foreach (var block in Blocks(start, end)) { points.Add(block.Start); points.Add(block.End); }
        foreach (var shift in shifts.Where(s => s.Start < end && s.End > start))
        {
            foreach (var point in new DateTime?[] { shift.Start, shift.End, shift.Break?.Start, shift.Break?.End })
                if (point is { } value && value > start && value < end) points.Add(value);
        }
        var closure = allowsOutsideHours ? null : ClosureOn(company, start.Date);
        if (closure is not null) { if (closure.Start > start && closure.Start < end) points.Add(closure.Start); if (closure.End > start && closure.End < end) points.Add(closure.End); }
        var boundaries = points.ToArray();
        for (var i = 0; i < boundaries.Length - 1; i++)
        {
            if (closure is not null && boundaries[i] >= closure.Start && boundaries[i + 1] <= closure.End) continue;
            yield return (boundaries[i], boundaries[i + 1]);
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
