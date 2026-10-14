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
        var holidayShifts = request.Document.Assignments.Where(a => a.Start.Date >= request.Start.Date && a.Start.Date <= request.End.Date && request.Document.Employees.Any(e=>e.Id==a.EmployeeId) && LaborRules.AuthorizedHolidayShift(request.Document.Company,a)).ToList();
        var candidates = BuildCandidates(request).Where(a=>!holidayShifts.Any(h=>h.EmployeeId==a.EmployeeId && h.Start.Date==a.Start.Date)).Concat(holidayShifts).ToList();
        var decisionVars = candidates.ToDictionary(x => x.Id, x => model.NewBoolVar($"assign_{x.Id:N}"));

        foreach (var shift in holidayShifts) model.Add(decisionVars[shift.Id] == 1);

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
        var occupancyTerms = new List<LinearExpr>();
        var blockIndex=0;
        foreach(var block in DemandBlocks(request,candidates)) {
            var covering=candidates.Where(a=>Covers(a,block.Start,block.End)).ToList();
            var allocation=new Dictionary<Guid,List<BoolVar>>();
            foreach(var requirement in block.Rules) {
                var eligible=covering.Where(a=>CanCover(request.Document.Employees.First(e=>e.Id==a.EmployeeId),requirement)).ToList();
                var allocated=new List<LinearExpr>();
                foreach(var candidate in eligible) {
                    if(requirement.Scope=="team") {allocated.Add(decisionVars[candidate.Id]);continue;}
                    var assigned=model.NewBoolVar($"coverage_{blockIndex}_{candidate.Id}_{requirement.Role}");
                    model.Add(assigned<=decisionVars[candidate.Id]);
                    if(!allocation.TryGetValue(candidate.Id,out var allocations)) allocation[candidate.Id]=allocations=[];
                    allocations.Add(assigned);allocated.Add(assigned);
                }
                var shortage=model.NewIntVar(0,requirement.MinimumEmployees,$"shortage_{shortageTerms.Count}");
                model.Add(LinearExpr.Sum(allocated)+shortage>=requirement.MinimumEmployees);
                shortageTerms.Add(LinearExpr.Term(shortage,-(long)((block.End-block.Start).TotalMinutes*1_000_000_000)));
            }
            foreach(var pair in allocation) model.Add(LinearExpr.Sum(pair.Value)<=decisionVars[pair.Key]);
            var relevant=covering.Where(a=>block.Rules.Any(r=>r.MinimumEmployees>0 && CanCover(request.Document.Employees.First(e=>e.Id==a.EmployeeId),r))).ToList();
            if(relevant.Count>0) {
                var present=model.NewBoolVar($"someone_present_{blockIndex}");
                model.Add(LinearExpr.Sum(relevant.Select(a=>decisionVars[a.Id]))>=1).OnlyEnforceIf(present);
                model.Add(LinearExpr.Sum(relevant.Select(a=>decisionVars[a.Id]))==0).OnlyEnforceIf(present.Not());
                occupancyTerms.Add(LinearExpr.Term(present,(long)((block.End-block.Start).TotalMinutes*10_000)));
            }
            blockIndex++;
        }

        var objectiveTerms = candidates.Select(candidate =>
        {
            var employee = request.Document.Employees.First(x => x.Id == candidate.EmployeeId);
            var preferenceWeight = employee.Preferences.Where(x => candidate.Tags.Contains(x.Code)).Sum(x => x.Weight);
            var lunchBalance = candidate.Break is null ? 0 : -Math.Abs((candidate.Break.Start.TimeOfDay - (candidate.Start.TimeOfDay + request.Document.Company.Lunch.PreferredAfter)).TotalMinutes) / 30;
            return LinearExpr.Term(decisionVars[candidate.Id], -1_000_000 + Math.Clamp(preferenceWeight + (long)lunchBalance + (candidate.Tags.Contains("closing") ? 100 : 0), -1000L, 1000L));
        });
        model.Maximize(LinearExpr.Sum(objectiveTerms.Concat(shortageTerms).Concat(occupancyTerms)));

        var solver = new CpSolver
        {
            StringParameters = "max_time_in_seconds:5,num_search_workers:8"
        };
        var status = solver.Solve(model);

        if (status is not (CpSolverStatus.Feasible or CpSolverStatus.Optimal))
        {
            var result = BuildResult(request, holidayShifts);
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
            if (LaborRules.ClosedHoliday(request.Document.Company,day)) continue;


            foreach (var employee in request.Document.Employees)
            {
                if (!employee.InheritsCompanyDefaults && employee.WorkingDays is { } days && !days.Contains(day.DayOfWeek)) continue;
                var rule = employee.InheritsCompanyDefaults ? request.Document.Company.DefaultWorkload : employee.Workload;
                var regime = regimeFactory.Resolve(rule.RegimeType);
                var windows = new List<(DateTime Start, DateTime End)>();
                if (request.Document.Company.OperatingDays.Contains(day.DayOfWeek)) windows.Add((day.Add(request.Document.Company.OpensAt.ToTimeSpan()), BuildEnd(day, request.Document.Company.OpensAt, request.Document.Company.ClosesAt)));
                windows.AddRange(request.Document.Company.Coverage.Where(c => c.AllowsOutsideHours && CanCover(employee,c) && c.Day == day.DayOfWeek).Select(c => (day.Add(c.Start.ToTimeSpan()), BuildEnd(day,c.Start,c.End))));
                foreach (var window in windows.Distinct()) {
                var opening = window.Start;
                var closing = window.End;
                var desiredWork = rule.DefaultShiftDuration;
                var closedInterval = employee.WorksDuringLunchClosure ? null : ClosureOn(request.Document.Company,day);
                foreach(var pauseDuration in PauseDurations(desiredWork,request.Document.Company.Lunch,employee.FixedInterval,closedInterval)) {
                var desiredSpan = desiredWork+pauseDuration;
                var shiftDuration = desiredSpan < closing-opening ? desiredSpan : closing-opening;
                if (shiftDuration <= TimeSpan.Zero) continue;
                var starts = new SortedSet<DateTime> { opening, closing - shiftDuration };
                for (var cursor = opening; cursor + shiftDuration <= closing; cursor = cursor.AddMinutes(30)) starts.Add(cursor);
                foreach (var available in employee.Availability) if (available.Start >= opening && available.Start + shiftDuration <= closing) starts.Add(available.Start);
                if (employee.ShiftStartsAt is { } entry) {
                    var fixedStart = day.Add(entry.ToTimeSpan());
                    starts = new SortedSet<DateTime>(fixedStart >= opening && fixedStart + shiftDuration <= closing ? new[] { fixedStart } : Array.Empty<DateTime>());
                }
                foreach (var start in starts)
                {
                var end = start.Add(shiftDuration);
                if (rule.RegimeType == "hourBased" && end - start - pauseDuration > TimeSpan.FromHours(rule.WorkUnits)) continue;
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
                foreach (var breakWindow in BuildBreakWindows(start, end, request.Document.Company.Lunch, employee.WorksDuringLunchClosure ? null : closure, pauseDuration, employee.FixedInterval))
                {
                    if (employee.WorksDuringLunchClosure && closure is not null && breakWindow is not null && breakWindow.Start < closure.End && breakWindow.End > closure.Start) continue;
                    var candidate = new ShiftAssignment(Guid.NewGuid(),employee.Id,employee.Role,start,end,breakWindow,"solver",[]);
                    if(WorkMinutes(candidate) > desiredWork.TotalMinutes || !LaborRules.ValidInterval(candidate) || WorkMinutes(candidate) > (employee.AllowsOvertime ? 600 : 480)) continue;
                    var tags = new List<string> { "net-work-duration" };
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
            if ((!employee.InheritsCompanyDefaults && employee.WorkingDays is { } workingDays && !workingDays.Contains(assignment.Start.DayOfWeek)) || (!LaborRules.AuthorizedHolidayShift(request.Document.Company,assignment) && !request.Document.Company.OperatingDays.Contains(assignment.Start.DayOfWeek) && !request.Document.Company.Coverage.Any(c => c.AllowsOutsideHours && CanCover(employee,c) && c.Day == assignment.Start.DayOfWeek && assignment.Start >= assignment.Start.Date.Add(c.Start.ToTimeSpan()) && assignment.End <= BuildEnd(assignment.Start.Date,c.Start,c.End))))
                yield return new ScheduleIssue("error", "workingDay", "Turno fora dos dias de trabalho.", assignment.Start, assignment.End);
            if(WorkMinutes(assignment) > (employee.AllowsOvertime ? 600 : 480)) yield return new ScheduleIssue("error","dailyLimit","Limite diário de trabalho excedido.",assignment.Start,assignment.End);
            if(!LaborRules.ValidInterval(assignment)) yield return new ScheduleIssue("error","interval","Intervalo obrigatório ausente, insuficiente ou fora da jornada (CLT, art. 71).",assignment.Start,assignment.End);
            if(LaborRules.ClosedHoliday(request.Document.Company,assignment.Start) && !LaborRules.AuthorizedHolidayShift(request.Document.Company,assignment)) yield return new ScheduleIssue("error","holiday","Turno em feriado configurado como fechado.",assignment.Start,assignment.End);
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

    private static bool CanCover(Employee employee,CoverageRequirement rule)
        => rule.Scope=="team" || employee.Role==rule.Role || (employee.CoverageRoles?.Contains(rule.Role) ?? false);

    private static IEnumerable<(DateTime Start,DateTime End,List<CoverageRequirement> Rules)> DemandBlocks(ScheduleRequest request,IReadOnlyList<ShiftAssignment> shifts)
    {
        var windows=new List<(DateTime Start,DateTime End,CoverageRequirement Rule,BreakWindow? Closure)>();
        var points=new SortedSet<DateTime>();
        foreach(var day in Days(request.Start,request.End)) {
            if(LaborRules.ClosedHoliday(request.Document.Company,day)) continue;
            foreach(var rule in request.Document.Company.Coverage.Where(r=>r.Day==day.DayOfWeek)) {
                var start=day+rule.Start.ToTimeSpan();var end=BuildEnd(day,rule.Start,rule.End);
                var closure=rule.AllowsOutsideHours ? null : ClosureOn(request.Document.Company,day);
                windows.Add((start,end,rule,closure));points.Add(start);points.Add(end);
                for(var t=start;t<end;t+=CoverageBlockSize)points.Add(t);
                if(closure is not null){points.Add(closure.Start);points.Add(closure.End);}
            }
        }
        foreach(var a in shifts) {points.Add(a.Start);points.Add(a.End);if(a.Break is not null){points.Add(a.Break.Start);points.Add(a.Break.End);}}
        var boundaries=points.ToArray();for(var i=0;i<boundaries.Length-1;i++) {
            var start=boundaries[i];var end=boundaries[i+1];
            var rules=windows.Where(w=>w.Start<=start && w.End>=end && !(w.Closure is not null && start>=w.Closure.Start && end<=w.Closure.End)).Select(w=>w.Rule).GroupBy(r=>new {r.Scope,r.Role}).Select(g=>g.MaxBy(r=>r.MinimumEmployees)!).ToList();
            if(rules.Count>0) yield return (start,end,rules);
        }
    }

    private IEnumerable<CoverageBlock> BuildCoverage(ScheduleRequest request,IReadOnlyList<ShiftAssignment> assignments)
    {
        foreach(var block in DemandBlocks(request,assignments)) {
            var people=request.Document.Employees.Where(e=>assignments.Any(a=>a.EmployeeId==e.Id && Covers(a,block.Start,block.End))).ToList();
            var slots=block.Rules.Where(r=>r.Scope!="team").SelectMany(r=>Enumerable.Repeat(r,r.MinimumEmployees)).ToList();
            var owners=new Dictionary<Guid,int>();
            bool Match(int slot,HashSet<Guid> visited) {
                foreach(var employee in people.OrderByDescending(e=>e.Role==slots[slot].Role)) {
                    if(!CanCover(employee,slots[slot]) || !visited.Add(employee.Id))continue;
                    if(!owners.TryGetValue(employee.Id,out var previous) || Match(previous,visited)){owners[employee.Id]=slot;return true;}
                }
                return false;
            }
            for(var i=0;i<slots.Count;i++) Match(i,[]);
            var counts=owners.Values.GroupBy(i=>slots[i].Role).ToDictionary(g=>g.Key,g=>g.Count());
            foreach(var person in people.Where(e=>!owners.ContainsKey(e.Id))) {
                var role=block.Rules.FirstOrDefault(r=>r.Scope!="team" && r.Role==person.Role) ?? block.Rules.FirstOrDefault(r=>r.Scope!="team" && CanCover(person,r));
                if(role is not null)counts[role.Role]=counts.GetValueOrDefault(role.Role)+1;
            }
            foreach(var rule in block.Rules) {
                var assigned=rule.Scope=="team" ? people.Count : counts.GetValueOrDefault(rule.Role);
                yield return new(block.Start,block.End,rule.Role,rule.MinimumEmployees,assigned,assigned>=rule.MinimumEmployees ? "healthy" : assigned==0 ? "uncovered" : "warning");
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
                    $"Mover ou estender o intervalo de {movableBreak.Role} reduz o buraco entre {gap.Start:HH\\h} e {gap.End:HH\\h}.",
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

    private static IEnumerable<TimeSpan> PauseDurations(TimeSpan work,LunchRule lunch,MiddayClosure? fixedInterval,BreakWindow? closure)
    {
        if(fixedInterval is not null) {
            var length=fixedInterval.End.ToTimeSpan()-fixedInterval.Start.ToTimeSpan();
            if(length<=TimeSpan.Zero) length+=TimeSpan.FromDays(1);
            if(length>=LaborRules.RequiredInterval(work) && length<=TimeSpan.FromHours(2)) yield return length;
            yield break;
        }
        var minimum=LaborRules.RequiredInterval(work);
        if(lunch.Minimum>minimum) minimum=lunch.Minimum;
        if(closure is not null && closure.End-closure.Start>minimum) minimum=closure.End-closure.Start;
        var maximum=lunch.Maximum>minimum ? lunch.Maximum : minimum;
        maximum=maximum<TimeSpan.FromHours(2) ? maximum : TimeSpan.FromHours(2);
        if(minimum>maximum) yield break;
        yield return minimum;
        for(var duration=minimum+TimeSpan.FromMinutes(15);duration<maximum;duration+=TimeSpan.FromMinutes(15)) yield return duration;
        if(maximum>minimum) yield return maximum;
    }

    private static IEnumerable<BreakWindow?> BuildBreakWindows(DateTime shiftStart,DateTime shiftEnd,LunchRule lunch,BreakWindow? closure,TimeSpan pauseDuration,MiddayClosure? fixedInterval)
    {
        if(fixedInterval is not null) {
            var start=shiftStart.Date.Add(fixedInterval.Start.ToTimeSpan());
            if(start<=shiftStart) start=start.AddDays(1);
            var end=start+pauseDuration;
            if(start>shiftStart && end<shiftEnd && (closure is null || shiftEnd<=closure.Start || shiftStart>=closure.End || (start<=closure.Start && end>=closure.End))) yield return new(start,end);
            yield break;
        }
        if(pauseDuration==TimeSpan.Zero) {if(closure is null || shiftEnd<=closure.Start || shiftStart>=closure.End) yield return null;yield break;}
        var earliest=shiftStart.AddMinutes(1);
        var latest=shiftEnd-pauseDuration-TimeSpan.FromMinutes(1);
        if(closure is not null && shiftStart<closure.End && shiftEnd>closure.Start) {
            if(closure.End-pauseDuration>earliest) earliest=closure.End-pauseDuration;
            if(closure.Start<latest) latest=closure.Start;
        }
        if(latest<earliest) yield break;
        var starts=new SortedSet<DateTime>{earliest,latest,Clamp(shiftStart+lunch.PreferredAfter,earliest,latest)};
        for(var cursor=shiftStart.AddMinutes(30);cursor<=latest;cursor+=BreakSearchStep) if(cursor>=earliest) starts.Add(cursor);
        foreach(var start in starts) yield return new(start,start+pauseDuration);
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
