using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Scheduling;
using EscalaLivre.Domain.Scheduling;
using Google.OrTools.Sat;

namespace EscalaLivre.Infrastructure.Solver;

public sealed class OrToolsScheduleSolver : IScheduleSolver
{
    private static readonly TimeSpan CoverageBlockSize = TimeSpan.FromHours(1);
    private static readonly TimeSpan BreakSearchStep = TimeSpan.FromMinutes(30);

    public ScheduleResult Solve(ScheduleRequest request)
    {
        var model = new CpModel();
        var preserved = request.Document.Assignments.Where(a => !ScheduleWindow.Contains(a, request.Start, request.End)).ToList();
        var history = preserved.ToLookup(a => a.EmployeeId);
        var holidayShifts = request.Document.Assignments.Where(a => ScheduleWindow.Contains(a, request.Start, request.End) && request.Document.Employees.Any(e=>e.Id==a.EmployeeId) && LaborRules.AuthorizedHolidayShift(request.Document.Company,a)).ToList();
        var candidates = BuildCandidates(request).Where(a=>!holidayShifts.Any(h=>h.EmployeeId==a.EmployeeId && h.Start.Date==a.Start.Date)).Take(30001).Concat(holidayShifts).ToList();
        if (candidates.Count > 30000) throw new ScheduleComplexityException();
        int modelSteps = 0;
        void Budget() { if (++modelSteps > 300000) throw new ScheduleComplexityException(); }
        // Preserved overnight shifts can also cover demand at either edge.
        var fixedCoverage = preserved.Where(a => a.End > request.Start.Date && a.Start < request.End.Date.AddDays(2)).ToList();
        if (candidates.Count + fixedCoverage.Count > 30000) throw new ScheduleComplexityException();
        var coverageCandidates = candidates.Concat(fixedCoverage).ToList();
        var decisionVars = coverageCandidates.ToDictionary(x => x.Id, x => model.NewBoolVar($"assign_{x.Id:N}"));

        foreach (var shift in holidayShifts.Concat(fixedCoverage)) model.Add(decisionVars[shift.Id] == 1);
        foreach(var shift in holidayShifts)
        {
            var employee=request.Document.Employees.First(e=>e.Id==shift.EmployeeId);
            if(ScheduleRules.ShiftDiagnostics(request.Document.Company,employee,shift).Any(c=>c.Severity=="error"))model.Add(decisionVars[shift.Id]==0);
        }

        foreach (var employeeGroup in candidates.GroupBy(x => new { x.EmployeeId, Day = x.Start.Date }))
        {
            model.Add(LinearExpr.Sum(employeeGroup.Select(x => decisionVars[x.Id])) <= 1);
        }

        foreach (IGrouping<Guid, ShiftAssignment> group in candidates.GroupBy(x => x.EmployeeId))
        {
            Employee employee = request.Document.Employees.First(x => x.Id == group.Key);
            WorkloadRule rule = employee.InheritsCompanyDefaults ? request.Document.Company.DefaultWorkload : employee.Workload;
            TimeSpan rest = RequiredRest(request, rule);
            var restHistory = history[employee.Id].Where(a => a.End + rest > request.Start.Date && a.Start < request.End.Date.AddDays(2) + rest).ToList();
            foreach (var candidate in group)
            {
                foreach (var existing in restHistory)
                {
                    Budget();
                    if (!ScheduleWindow.RestConflict(candidate, existing, rest)) continue;
                    model.Add(decisionVars[candidate.Id] == 0);
                    break;
                }
            }
            var ordered = group.OrderBy(x => x.Start).ToList();
            for (int i = 0; i < ordered.Count; i++)
            for (int j = i + 1; j < ordered.Count && ordered[j].Start < ordered[i].End + rest; j++)
                { if(ordered[i].Start.Date==ordered[j].Start.Date)continue; Budget(); model.Add(decisionVars[ordered[i].Id] + decisionVars[ordered[j].Id] <= 1); }
        }

        foreach (var employeeWeek in candidates.SelectMany(a => ScheduleWindow.Weeks(a).Select(week => new { Shift = a, Week = week }))
                     .GroupBy(x => new { x.Shift.EmployeeId, x.Week }))
        {
            Employee employee = request.Document.Employees.First(x => x.Id == employeeWeek.Key.EmployeeId);
            WorkloadRule rule = employee.InheritsCompanyDefaults ? request.Document.Company.DefaultWorkload : employee.Workload;
            var week = employeeWeek.Key.Week;
            long fixedWork = history[employee.Id].Sum(a => ScheduleWindow.WorkTicksInWeek(a, week));
            long limit = (long)Math.Floor(rule.WeeklyLimitHours * TimeSpan.TicksPerHour);
            var weightedWork = employeeWeek.Select(x => LinearExpr.Term(decisionVars[x.Shift.Id], ScheduleWindow.WorkTicksInWeek(x.Shift, week)));
            model.Add(LinearExpr.Sum(weightedWork) <= Math.Max(0, limit - fixedWork));
        }

        foreach (IGrouping<Guid, ShiftAssignment> group in candidates.GroupBy(x => x.EmployeeId))
        {
            Employee employee = request.Document.Employees.First(x => x.Id == group.Key);
            WorkloadRule rule = employee.InheritsCompanyDefaults ? request.Document.Company.DefaultWorkload : employee.Workload;
            if (rule.RegimeType != "dayBased") continue;
            int cycle = Math.Max(1, rule.WorkUnits + rule.RestUnits);
            foreach (DateTime lastDay in Days(request.Start, request.End.AddDays(cycle - 1)))
            {
                DateTime firstDay = lastDay.AddDays(1 - cycle);
                int fixedDays = history[employee.Id].Where(a => a.Start.Date >= firstDay && a.Start.Date <= lastDay).Select(a => a.Start.Date).Distinct().Count();
                model.Add(LinearExpr.Sum(group.Where(a => a.Start.Date >= firstDay && a.Start.Date <= lastDay).Select(a => decisionVars[a.Id])) <= Math.Max(0, rule.WorkUnits - fixedDays));
            }
        }

        var shortageTerms = new List<LinearExpr>();
        var occupancyTerms = new List<LinearExpr>();
        int blockIndex =0;
        foreach((DateTime Start, DateTime End, List<CoverageRequirement> Rules) block in DemandBlocks(request,coverageCandidates)) {
            var covering=coverageCandidates.Where(a=>Covers(a,block.Start,block.End)).ToList();
            var allocation=new Dictionary<Guid,List<BoolVar>>();
            foreach(CoverageRequirement requirement in block.Rules) {
                Budget();
                var eligible=covering.Where(a=>CanCover(request.Document.Employees.First(e=>e.Id==a.EmployeeId),requirement)).ToList();
                var allocated=new List<LinearExpr>();
                foreach(ShiftAssignment? candidate in eligible) {
                    Budget();
                    if(requirement.Scope=="team") {allocated.Add(decisionVars[candidate.Id]);continue;}
                    BoolVar assigned =model.NewBoolVar($"coverage_{blockIndex}_{candidate.Id}_{requirement.Role}");
                    model.Add(assigned<=decisionVars[candidate.Id]);
                    if(!allocation.TryGetValue(candidate.Id,out List<BoolVar>? allocations)) allocation[candidate.Id]=allocations=[];
                    allocations.Add(assigned);allocated.Add(assigned);
                }
                IntVar shortage =model.NewIntVar(0,requirement.MinimumEmployees,$"shortage_{shortageTerms.Count}");
                model.Add(LinearExpr.Sum(allocated)+shortage>=requirement.MinimumEmployees);
                shortageTerms.Add(LinearExpr.Term(shortage,-(long)((block.End-block.Start).TotalMinutes*1_000_000_000)));
            }
            foreach(KeyValuePair<Guid, List<BoolVar>> pair in allocation) model.Add(LinearExpr.Sum(pair.Value)<=decisionVars[pair.Key]);
            var relevant=covering.Where(a=>block.Rules.Any(r=>r.MinimumEmployees>0 && CanCover(request.Document.Employees.First(e=>e.Id==a.EmployeeId),r))).ToList();
            if(relevant.Count>0) {
                BoolVar present =model.NewBoolVar($"someone_present_{blockIndex}");
                model.Add(LinearExpr.Sum(relevant.Select(a=>decisionVars[a.Id]))>=1).OnlyEnforceIf(present);
                model.Add(LinearExpr.Sum(relevant.Select(a=>decisionVars[a.Id]))==0).OnlyEnforceIf(present.Not());
                occupancyTerms.Add(LinearExpr.Term(present,(long)((block.End-block.Start).TotalMinutes*10_000)));
            }
            blockIndex++;
        }

        IEnumerable<LinearExpr> objectiveTerms = candidates.Select(candidate =>
        {
            Employee employee = request.Document.Employees.First(x => x.Id == candidate.EmployeeId);
            int preferenceWeight = employee.Preferences.Where(x => candidate.Tags.Contains(x.Code)).Sum(x => x.Weight);
            double lunchBalance = candidate.Break is null ? 0 : -Math.Abs((candidate.Break.Start.TimeOfDay - (candidate.Start.TimeOfDay + request.Document.Company.Lunch.PreferredAfter)).TotalMinutes) / 30;
            return LinearExpr.Term(decisionVars[candidate.Id], -1_000_000 + Math.Clamp(preferenceWeight + (long)lunchBalance + (candidate.Tags.Contains("closing") ? 100 : 0), -1000L, 1000L));
        });
        model.Maximize(LinearExpr.Sum(objectiveTerms.Concat(shortageTerms).Concat(occupancyTerms)));

        var solver = new CpSolver
        {
            StringParameters = "max_time_in_seconds:5,num_search_workers:1"
        };
        CpSolverStatus status = solver.Solve(model);

        if (status is not (CpSolverStatus.Feasible or CpSolverStatus.Optimal))
        {
            ScheduleResult result = BuildResult(request, request.Document.Assignments);
            return result with
            {
                Decisions = [],
                Optimization = new(status == CpSolverStatus.Unknown ? "timeout" : status == CpSolverStatus.Infeasible ? "infeasible" : "invalid"),
                Conflicts = result.Conflicts.Concat(
                [
                    new ScheduleIssue("error", status == CpSolverStatus.Unknown ? "solverTimeout" : status == CpSolverStatus.Infeasible ? "solverInfeasible" : "solverInvalid", status == CpSolverStatus.Unknown ? "O limite de tempo terminou sem uma escala viavel." : status == CpSolverStatus.Infeasible ? "Nenhuma escala satisfaz todas as restricoes obrigatorias no periodo informado." : "O modelo de otimização não pôde ser validado.", request.Start, request.End)
                ]).ToList()
            };
        }

        var assignments = candidates.Where(x => solver.Value(decisionVars[x.Id]) == 1).ToList();
        return BuildResult(request, ScheduleWindow.Replace(request.Document.Assignments, assignments, request.Start, request.End))
            with { Decisions = BuildDecisions(request, assignments).ToList(), Optimization = new(status == CpSolverStatus.Optimal ? "optimal" : "feasible") };
    }

    public ScheduleResult Validate(ScheduleRequest request)
        => BuildResult(request, request.Document.Assignments);

    public ScheduleResult Analyze(ScheduleRequest request)
        => BuildResult(request, request.Document.Assignments);

    private IEnumerable<ShiftAssignment> BuildCandidates(ScheduleRequest request)
    {
        foreach (DateTime day in Days(request.Start, request.End))
        {
            if (LaborRules.ClosedHoliday(request.Document.Company,day)) continue;


            foreach (Employee employee in request.Document.Employees)
            {
                if (!employee.InheritsCompanyDefaults && employee.WorkingDays is { } days && !days.Contains(day.DayOfWeek)) continue;
                WorkloadRule rule = employee.InheritsCompanyDefaults ? request.Document.Company.DefaultWorkload : employee.Workload;
                var windows = new List<(DateTime Start, DateTime End)>();
                if (request.Document.Company.OperatingDays.Contains(day.DayOfWeek)) windows.Add((day.Add(request.Document.Company.OpensAt.ToTimeSpan()), BuildEnd(day, request.Document.Company.OpensAt, request.Document.Company.ClosesAt)));
                windows.AddRange(request.Document.Company.Coverage.Where(c => c.AllowsOutsideHours && CanCover(employee,c) && c.Day == day.DayOfWeek).Select(c => (day.Add(c.Start.ToTimeSpan()), BuildEnd(day,c.Start,c.End))));
                foreach ((DateTime Start, DateTime End) window in windows.Distinct()) {
                    DateTime opening = window.Start;
                    DateTime closing = window.End;
                    TimeSpan desiredWork = rule.DefaultShiftDuration;
                    BreakWindow? closedInterval = employee.WorksDuringLunchClosure ? null : ScheduleRules.Closures(request.Document.Company,window.Start,window.End).FirstOrDefault();
                foreach(TimeSpan pauseDuration in PauseDurations(desiredWork,request.Document.Company.Lunch,employee.FixedInterval,closedInterval)) {
                        TimeSpan desiredSpan = desiredWork+pauseDuration;
                        TimeSpan shiftDuration = desiredSpan < closing-opening ? desiredSpan : closing-opening;
                if (shiftDuration <= TimeSpan.Zero) continue;
                var starts = new SortedSet<DateTime> { opening, closing - shiftDuration };
                for (DateTime cursor = opening; cursor + shiftDuration <= closing; cursor = cursor.AddMinutes(30)) starts.Add(cursor);
                foreach (AvailabilityWindow available in employee.Availability) if (available.Start >= opening && available.Start + shiftDuration <= closing) starts.Add(available.Start);
                if (employee.ShiftStartsAt is { } entry) {
                            DateTime fixedStart = day.Add(entry.ToTimeSpan());
                    starts = new SortedSet<DateTime>(fixedStart >= opening && fixedStart + shiftDuration <= closing ? new[] { fixedStart } : Array.Empty<DateTime>());
                }
                foreach (DateTime start in starts)
                {
                            DateTime end = start.Add(shiftDuration);
                if (rule.RegimeType == "hourBased" && end - start - pauseDuration > TimeSpan.FromHours(rule.WorkUnits)) continue;
                if (!employee.AllowsNightWork && IsNight(start, end)) continue;

                // All outside shifts remain fixed. The model checks rest and workload at both edges.
                if (!IsAvailable(employee, start, end))
                {
                    continue;
                }

                            BreakWindow? closure = ScheduleRules.Closures(request.Document.Company,start,end).FirstOrDefault();

                foreach (BreakWindow? breakWindow in BuildBreakWindows(start, end, request.Document.Company.Lunch, employee.WorksDuringLunchClosure ? null : closure, pauseDuration, employee.FixedInterval))
                {
                    if (employee.WorksDuringLunchClosure && closure is not null && breakWindow is not null && breakWindow.Start < closure.End && breakWindow.End > closure.Start) continue;
                    var candidate = new ShiftAssignment(Guid.NewGuid(),employee.Id,employee.Role,start,end,breakWindow,"solver",[]);
                    if(ScheduleRules.ShiftDiagnostics(request.Document.Company,employee,candidate).Any(c=>c.Severity=="error") || WorkMinutes(candidate) > (employee.AllowsOvertime ? 600 : 480)) continue;
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
        var gaps=new List<CoverageGap>();
        foreach(var block in coverage.Where(x=>x.Assigned<x.Required))
        {
            int missing=block.Required-block.Assigned;
            int previous=gaps.FindLastIndex(g=>g.Role==block.Role);
            if(previous>=0&&gaps[previous].End==block.Start&&gaps[previous].MissingEmployees==missing)gaps[previous]=gaps[previous] with {End=block.End};
            else gaps.Add(new(block.Start,block.End,block.Role,missing));
        }
        var suggestions = HiringDemand.Suggest(gaps,request.Document.Company.DefaultWorkload.WeeklyLimitHours);

        var optimizationSuggestions = BuildOptimizationSuggestions(assignments, coverage).ToList();
        var decisions = BuildDecisions(request, assignments).ToList();
        double requiredMinutes = coverage.Sum(x => Math.Max(0, x.Required) * (x.End - x.Start).TotalMinutes);
        double coveredMinutes = coverage.Sum(x => Math.Min(x.Required, x.Assigned) * (x.End - x.Start).TotalMinutes);
        double score = requiredMinutes == 0 ? 1 : Math.Max(0, coveredMinutes / requiredMinutes);
        return new ScheduleResult(assignments, conflicts, coverage, gaps, suggestions, optimizationSuggestions, decisions, Math.Round(score, 3, MidpointRounding.AwayFromZero),new("not-run"));
    }

    private static IEnumerable<ScheduleIssue> DetectConflicts(ScheduleRequest request,IReadOnlyList<ShiftAssignment> assignments)
        => ScheduleRules.Diagnose(request.Document,assignments);

    private static double WorkMinutes(ShiftAssignment assignment)
        => ScheduleRules.Work(assignment).TotalMinutes;

    private static TimeSpan RequiredRest(ScheduleRequest request, WorkloadRule rule)
        => rule.RegimeType == "hourBased" && TimeSpan.FromHours(rule.RestUnits) > request.Document.Company.MinimumRest
            ? TimeSpan.FromHours(rule.RestUnits) : request.Document.Company.MinimumRest;

    private static bool IsNight(DateTime start, DateTime end)
        => start.Hour < 6 || end > start.Date.AddHours(22);

    private static bool CanCover(Employee employee,CoverageRequirement rule)
        => ScheduleRules.CanCover(employee,rule);

    private static IEnumerable<(DateTime Start,DateTime End,List<CoverageRequirement> Rules)> DemandBlocks(ScheduleRequest request,IReadOnlyList<ShiftAssignment> shifts)
    {
        var windows=new List<(DateTime Start,DateTime End,CoverageRequirement Rule,BreakWindow? Closure)>();
        var points=new SortedSet<DateTime>();
        foreach(DateTime day in Days(request.Start,request.End)) {
            if(LaborRules.ClosedHoliday(request.Document.Company,day)) continue;
            foreach(CoverageRequirement? rule in request.Document.Company.Coverage.Where(r=>r.Day==day.DayOfWeek)) {
                DateTime start =day+rule.Start.ToTimeSpan(); DateTime end =BuildEnd(day,rule.Start,rule.End);
                BreakWindow? closure =rule.AllowsOutsideHours ? null : ClosureOn(request.Document.Company,day);
                windows.Add((start,end,rule,closure));points.Add(start);points.Add(end);
                for(DateTime t =start;t<end;t+=CoverageBlockSize)points.Add(t);
                if(closure is not null){points.Add(closure.Start);points.Add(closure.End);}
            }
        }
        foreach(ShiftAssignment a in shifts) {points.Add(a.Start);points.Add(a.End);if(a.Break is not null){points.Add(a.Break.Start);points.Add(a.Break.End);}}
        DateTime[] boundaries =points.ToArray();for(int i =0;i<boundaries.Length-1;i++) {
            DateTime start =boundaries[i]; DateTime end =boundaries[i+1];
            var rules=windows.Where(w=>w.Start<=start && w.End>=end && !(w.Closure is not null && start>=w.Closure.Start && end<=w.Closure.End)).Select(w=>w.Rule).GroupBy(r=>new {r.Scope,r.Role}).Select(g=>g.MaxBy(r=>r.MinimumEmployees)!).ToList();
            if(rules.Count>0) yield return (start,end,rules);
        }
    }

    private IEnumerable<CoverageBlock> BuildCoverage(ScheduleRequest request,IReadOnlyList<ShiftAssignment> assignments)
    {
        foreach((DateTime Start, DateTime End, List<CoverageRequirement> Rules) block in DemandBlocks(request,assignments)) {
            var people=request.Document.Employees.Where(e=>assignments.Any(a=>a.EmployeeId==e.Id && Covers(a,block.Start,block.End))).ToList();
            var slots=block.Rules.Where(r=>r.Scope!="team").SelectMany(r=>Enumerable.Repeat(r,r.MinimumEmployees)).ToList();
            var owners=new Dictionary<Guid,int>();
            bool Match(int slot,HashSet<Guid> visited) {
                foreach(Employee? employee in people.OrderByDescending(e=>e.Role==slots[slot].Role)) {
                    if(!CanCover(employee,slots[slot]) || !visited.Add(employee.Id))continue;
                    if(!owners.TryGetValue(employee.Id,out int previous) || Match(previous,visited)){owners[employee.Id]=slot;return true;}
                }
                return false;
            }
            for(int i =0;i<slots.Count;i++) Match(i,[]);
            var counts=owners.Values.GroupBy(i=>slots[i].Role).ToDictionary(g=>g.Key,g=>g.Count());
            foreach(Employee? person in people.Where(e=>!owners.ContainsKey(e.Id))) {
                CoverageRequirement? role =block.Rules.FirstOrDefault(r=>r.Scope!="team" && r.Role==person.Role) ?? block.Rules.FirstOrDefault(r=>r.Scope!="team" && CanCover(person,r));
                if(role is not null)counts[role.Role]=counts.GetValueOrDefault(role.Role)+1;
            }
            foreach(CoverageRequirement rule in block.Rules) {
                int assigned =rule.Scope=="team" ? people.Count : counts.GetValueOrDefault(rule.Role);
                yield return new(block.Start,block.End,rule.Role,rule.MinimumEmployees,assigned,assigned>=rule.MinimumEmployees ? "healthy" : assigned==0 ? "uncovered" : "warning");
            }
        }
    }

    private static IEnumerable<OptimizationSuggestion> BuildOptimizationSuggestions(IReadOnlyList<ShiftAssignment> assignments, IReadOnlyList<CoverageBlock> coverage)
    {
        foreach (CoverageBlock? gap in coverage.Where(x => x.State == "uncovered").Take(8))
        {
            ShiftAssignment? movableBreak = assignments.FirstOrDefault(x =>
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
        foreach (ShiftAssignment? assignment in assignments.Take(1000))
        {
            Employee? employee = request.Document.Employees.FirstOrDefault(x => x.Id == assignment.EmployeeId);
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

    private static bool IsAvailable(Employee employee, DateTime start, DateTime end) => ScheduleRules.Available(employee,start,end);

    private static DateTime BuildEnd(DateTime day, TimeOnly start, TimeOnly end)
    {
        DateTime value = day.Add(end.ToTimeSpan());
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
        if(fixedInterval is not null)
        {
            var length=fixedInterval.End.ToTimeSpan()-fixedInterval.Start.ToTimeSpan();if(length<=TimeSpan.Zero)length+=TimeSpan.FromDays(1);
            if(length<=TimeSpan.FromHours(2))yield return length;
            yield break;
        }
        var choices=new SortedSet<TimeSpan>{TimeSpan.Zero,lunch.Minimum,lunch.Maximum,LaborRules.RequiredInterval(work)};
        if(closure is not null)choices.Add(closure.End-closure.Start);
        for(int minutes=15;minutes<=120;minutes+=15)choices.Add(TimeSpan.FromMinutes(minutes));
        foreach(var duration in choices)if(duration>=TimeSpan.Zero&&duration<=TimeSpan.FromHours(2))yield return duration;
    }

    private static IEnumerable<BreakWindow?> BuildBreakWindows(DateTime shiftStart,DateTime shiftEnd,LunchRule lunch,BreakWindow? closure,TimeSpan pauseDuration,MiddayClosure? fixedInterval)
    {
        if(fixedInterval is not null) {
            DateTime start =shiftStart.Date.Add(fixedInterval.Start.ToTimeSpan());
            if(start<=shiftStart) start=start.AddDays(1);
            DateTime end =start+pauseDuration;
            if(start>shiftStart && end<shiftEnd && (closure is null || shiftEnd<=closure.Start || shiftStart>=closure.End || (start<=closure.Start && end>=closure.End))) yield return new(start,end);
            yield break;
        }
        if(pauseDuration==TimeSpan.Zero) {if(closure is null || shiftEnd<=closure.Start || shiftStart>=closure.End) yield return null;yield break;}
        DateTime earliest =shiftStart.AddMinutes(1);
        DateTime latest =shiftEnd-pauseDuration-TimeSpan.FromMinutes(1);
        if(closure is not null && shiftStart<closure.End && shiftEnd>closure.Start) {
            if(closure.End-pauseDuration>earliest) earliest=closure.End-pauseDuration;
            if(closure.Start<latest) latest=closure.Start;
        }
        if(latest<earliest) yield break;
        var starts=new SortedSet<DateTime>{earliest,latest,Clamp(shiftStart+lunch.PreferredAfter,earliest,latest)};
        for(DateTime cursor =shiftStart.AddMinutes(30);cursor<=latest;cursor+=BreakSearchStep) if(cursor>=earliest) starts.Add(cursor);
        foreach(DateTime start in starts) yield return new(start,start+pauseDuration);
    }

    private static BreakWindow? ClosureOn(CompanyRules company,DateTime day)=>ScheduleRules.ClosureOn(company,day);

    private static IEnumerable<(DateTime Start, DateTime End)> CoverageBlocks(DateTime start, DateTime end, CompanyRules company, bool allowsOutsideHours, IReadOnlyList<ShiftAssignment> shifts)
    {
        var points = new SortedSet<DateTime> { start, end };
        foreach ((DateTime Start, DateTime End) block in Blocks(start, end)) { points.Add(block.Start); points.Add(block.End); }
        foreach (ShiftAssignment? shift in shifts.Where(s => s.Start < end && s.End > start))
        {
            foreach (DateTime? point in new DateTime?[] { shift.Start, shift.End, shift.Break?.Start, shift.Break?.End })
                if (point is { } value && value > start && value < end) points.Add(value);
        }
        BreakWindow? closure = allowsOutsideHours ? null : ClosureOn(company, start.Date);
        if (closure is not null) { if (closure.Start > start && closure.Start < end) points.Add(closure.Start); if (closure.End > start && closure.End < end) points.Add(closure.End); }
        DateTime[] boundaries = points.ToArray();
        for (int i = 0; i < boundaries.Length - 1; i++)
        {
            if (closure is not null && boundaries[i] >= closure.Start && boundaries[i + 1] <= closure.End) continue;
            yield return (boundaries[i], boundaries[i + 1]);
        }
    }

    private static DateTime Clamp(DateTime value, DateTime min, DateTime max)
        => value < min ? min : value > max ? max : value;

    private static IEnumerable<(DateTime Start, DateTime End)> Blocks(DateTime start, DateTime end)
    {
        for (DateTime cursor = start; cursor < end; cursor = cursor.Add(CoverageBlockSize))
        {
            yield return (cursor, cursor.Add(CoverageBlockSize) > end ? end : cursor.Add(CoverageBlockSize));
        }
    }

    private static IEnumerable<DateTime> Days(DateTime start, DateTime end)
    {
        for (DateTime day = start.Date; day < end.Date.AddDays(1); day = day.AddDays(1))
        {
            yield return day;
        }
    }
}
