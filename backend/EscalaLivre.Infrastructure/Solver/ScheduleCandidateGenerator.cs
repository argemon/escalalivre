using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Scheduling;
using EscalaLivre.Domain.Planning;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Infrastructure.Solver;

public sealed class ScheduleCandidateGenerator
{
    private static readonly TimeSpan BreakSearchStep = TimeSpan.FromMinutes(30);

    public IEnumerable<ShiftAssignment> Generate(ScheduleRequest request)
    {
        var settings = new PlanningSettings(request.Document.Company, request.Document.Employees);
        var company = settings.Company;
        foreach (DateTime day in CalendarDays.Inclusive(request.Start, request.End))
        {
            if (LaborRules.ClosedHoliday(company,day)) continue;


            foreach (Employee registered in settings.Employees)
            {
                if(!EmploymentPolicy.ActiveOn(registered,day))continue;
                var employee=EmploymentPolicy.On(registered,day);
                if (!employee.InheritsCompanyDefaults && employee.WorkingDays is { } days && !days.Contains(day.DayOfWeek)) continue;
                var anchors = request.Document.Assignments.Where(a=>a.EmployeeId==employee.Id && a.Break is not null
                    && (!ScheduleWindow.Contains(a,request.Start,request.End)||a.Pinned==true||LaborRules.AuthorizedHolidayShift(company,a))
                    && ScheduleWindow.WeekStart(a.Start)==ScheduleWindow.WeekStart(day)).ToArray();
                var regime = settings.RegimeFor(employee.Id);
                var windows = new List<(DateTime Start, DateTime End)>();
                if (company.OperatingDays.Contains(day.DayOfWeek)) windows.Add((day.Add(company.OpensAt.ToTimeSpan()), ScheduleRules.EndOn(day, company.OpensAt, company.ClosesAt)));
                windows.AddRange(company.Coverage.Where(c => c.AllowsOutsideHours && ScheduleRules.CanCover(employee,c,request.Document.Roles) && c.Day == day.DayOfWeek).Select(c => (day.Add(c.Start.ToTimeSpan()), ScheduleRules.EndOn(day,c.Start,c.End))));
                var usableWindows = WeeklyWorkPlanPolicy.For(company,employee) is null ? windows : windows.SelectMany(w=>AvailabilityPolicy.GenerationWindows(employee,w.Start,w.End)).ToList();
                foreach ((DateTime Start, DateTime End) window in usableWindows.Distinct()) {
                    DateTime opening = window.Start;
                    DateTime closing = window.End;
                    foreach(TimeSpan desiredWork in ContractWorkPolicy.CandidateDurations(request.Document,employee,day,request.Start,request.End)) {
                    if (desiredWork <= TimeSpan.Zero) continue;
                    BreakWindow? closedInterval = employee.WorksDuringLunchClosure ? null : IntervalPolicy.Closures(company,window.Start,window.End).FirstOrDefault();
                foreach(TimeSpan pauseDuration in PauseDurations(desiredWork,company.Lunch,employee.FixedInterval,closedInterval,WeeklyWorkPlanPolicy.For(company,employee) is null ? null : closing-opening-desiredWork,anchors)) {
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
                if (EffectiveWorkPolicy.ExceedsRegimeWork(end - start - pauseDuration, regime)) continue;
                if (!employee.AllowsNightWork && IsNight(start, end)) continue;

                // All outside shifts remain fixed. The model checks rest and workload at both edges.
                if (!IsAvailable(employee, start, end))
                {
                    continue;
                }

                            BreakWindow? closure = IntervalPolicy.Closures(company,start,end).FirstOrDefault();

                foreach (BreakWindow? breakWindow in BuildBreakWindows(start, end, company.Lunch, employee.WorksDuringLunchClosure ? null : closure, pauseDuration, employee.FixedInterval,anchors))
                {
                    if (employee.WorksDuringLunchClosure && closure is not null && breakWindow is not null && breakWindow.Start < closure.End && breakWindow.End > closure.Start) continue;
                    var candidate = new ShiftAssignment(Guid.NewGuid(),employee.Id,employee.Role,start,end,breakWindow,"solver",[],employee.RoleId);
                    if (!IntervalTimingPolicy.HasWorkAroundPause(candidate)) continue;
                    if(ScheduleRules.ShiftDiagnostics(company,employee,candidate,request.Document.Roles).Any(c=>c.Severity=="error") || EffectiveWorkPolicy.Measure(candidate) > ContractWorkPolicy.DailyLimit(company,employee,day)) continue;
                    if (WeeklyWorkPlanPolicy.For(company,employee) is not null && !CoverageDemand.HasRelevantDemand(company,employee,candidate,request.Document.Roles)) continue;
                    var tags = new List<string> { "net-work-duration" };
                    if (WeeklyWorkPlanPolicy.For(company,employee) is null ? start == opening : windows.Any(w=>w.Start==start)) tags.Add("opening");
                    if (WeeklyWorkPlanPolicy.For(company,employee) is null ? end == closing : windows.Any(w=>w.End==end)) tags.Add("closing");
                    if (start.Hour < 12) tags.Add("morning");
                    if (employee.PreferredDaysOff.Contains(day.DayOfWeek))
                    {
                        tags.Add("preferredDayOff");
                    }

                    if (start.Hour < 6 || end.Hour >= 22 || end.Date > start.Date)
                    {
                        tags.Add("night");
                    }

                    yield return new ShiftAssignment(Guid.NewGuid(), employee.Id, employee.Role, start, end, breakWindow, "solver", tags, employee.RoleId);
                }
                }
                }
                }
                }
            }
        }
    }


    private static bool IsNight(DateTime start, DateTime end)
        => ShiftEligibilityPolicy.IsNight(start, end);


    private static bool IsAvailable(Employee employee, DateTime start, DateTime end) => AvailabilityPolicy.Allows(employee,start,end);

    private static IEnumerable<TimeSpan> PauseDurations(TimeSpan work,LunchRule lunch,MiddayClosure? fixedInterval,BreakWindow? closure,TimeSpan? boundaryPause,IReadOnlyList<ShiftAssignment> anchors)
    {
        if(fixedInterval is not null)
        {
            var length=fixedInterval.End.ToTimeSpan()-fixedInterval.Start.ToTimeSpan();if(length<=TimeSpan.Zero)length+=TimeSpan.FromDays(1);
            if(length<=TimeSpan.FromHours(2))yield return length;
            yield break;
        }
        var choices=new SortedSet<TimeSpan>{TimeSpan.Zero,lunch.Minimum,lunch.Maximum,IntervalPolicy.Required(work)};
        foreach(var a in anchors) choices.Add(a.Break!.End-a.Break.Start);
        if(boundaryPause is {} exact) choices.Add(exact);
        if(closure is not null)choices.Add(closure.End-closure.Start);
        for(int minutes=15;minutes<=120;minutes+=15)choices.Add(TimeSpan.FromMinutes(minutes));
        foreach(var duration in choices)if(duration>=TimeSpan.Zero&&duration<=TimeSpan.FromHours(2))yield return duration;
    }

    private static IEnumerable<BreakWindow?> BuildBreakWindows(DateTime shiftStart,DateTime shiftEnd,LunchRule lunch,BreakWindow? closure,TimeSpan pauseDuration,MiddayClosure? fixedInterval,IReadOnlyList<ShiftAssignment> anchors)
    {
        if(fixedInterval is not null) {
            DateTime start =shiftStart.Date.Add(fixedInterval.Start.ToTimeSpan());
            if(start<=shiftStart) start=start.AddDays(1);
            DateTime end =start+pauseDuration;
            if(start-shiftStart>=IntervalTimingPolicy.WorkMargin && shiftEnd-end>=IntervalTimingPolicy.WorkMargin && (closure is null || shiftEnd<=closure.Start || shiftStart>=closure.End || (start<=closure.Start && end>=closure.End))) yield return new(start,end);
            yield break;
        }
        if(pauseDuration==TimeSpan.Zero) {if(closure is null || shiftEnd<=closure.Start || shiftStart>=closure.End) yield return null;yield break;}
        DateTime earliest =shiftStart+IntervalTimingPolicy.WorkMargin;
        DateTime latest =shiftEnd-pauseDuration-IntervalTimingPolicy.WorkMargin;
        if(closure is not null && shiftStart<closure.End && shiftEnd>closure.Start) {
            if(closure.End-pauseDuration>earliest) earliest=closure.End-pauseDuration;
            if(closure.Start<latest) latest=closure.Start;
        }
        if(latest<earliest) yield break;
        var starts=new SortedSet<DateTime>{earliest,latest,Clamp(shiftStart+lunch.PreferredAfter,earliest,latest)};
        foreach(var anchor in anchors.Where(a=>a.Break!.End-a.Break.Start==pauseDuration)) {
            var anchored=shiftStart.Date.AddDays((anchor.Break!.Start.Date-anchor.Start.Date).Days)+anchor.Break.Start.TimeOfDay;
            if(anchored>=earliest && anchored<=latest) starts.Add(anchored);
        }
        for(DateTime cursor =shiftStart.AddMinutes(30);cursor<=latest;cursor+=BreakSearchStep) if(cursor>=earliest) starts.Add(cursor);
        foreach(DateTime start in starts) yield return new(start,start+pauseDuration);
    }

    private static DateTime Clamp(DateTime value, DateTime min, DateTime max)
        => value < min ? min : value > max ? max : value;


}
