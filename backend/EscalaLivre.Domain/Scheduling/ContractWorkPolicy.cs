using EscalaLivre.Domain.Planning;

namespace EscalaLivre.Domain.Scheduling;

// Explicit net contractual credit; never inferred from an availability/restriction window.
public sealed record ContractLeave
{
    public DateOnly Date { get; }
    public int ExcusedSeconds { get; }
    public ContractLeave(DateOnly date,int excusedSeconds)
    {
        if (date.Year is < 1900 or > 2100 || excusedSeconds is < 1 or > 86400)
            throw new ArgumentException("Data ou crédito líquido de afastamento inválido.");
        Date=date; ExcusedSeconds=excusedSeconds;
    }
}
public sealed record DailyWorkload(DateTime Date, long NominalSeconds, long ExcusedSeconds, long ExpectedSeconds,
    long PlannedSeconds, long RecognizedSeconds, long UnmetSeconds, long ExcessSeconds);
public sealed record WorkloadSummary(Guid EmployeeId, DateTime WeekStart, int ContractedSeconds,
    long NominalSeconds, long ExcusedSeconds, long ExpectedSeconds, long PlannedSeconds,
    long RecognizedSeconds, long UnmetSeconds, long ExcessSeconds, long HistoricalWorkSeconds, IReadOnlyList<DailyWorkload> Days, long? UnassignedSeconds = null);

public static class ContractWorkPolicy
{
    public static int Nominal(CompanyRules company, Employee employee, DateTime day)
        => WeeklyWorkPlanPolicy.For(company, employee) is {} plan ? plan.FlexibleWorkDays is {} count
            ? (plan.ContractedSeconds + count - 1) / count : plan.DailySeconds[(int)day.DayOfWeek] : 0;
    public static int Excused(CompanyRules company, Employee employee, DateTime day)
    {
        int nominal = Nominal(company, employee, day);
        if (WeeklyWorkPlanPolicy.For(company,employee)?.FlexibleWorkDays is null && LaborRules.ClosedHoliday(company, day)) return nominal;
        return (int)Math.Min(nominal, employee.ContractLeaves?.Where(l => l.Date == DateOnly.FromDateTime(day)).Sum(l => (long)l.ExcusedSeconds) ?? 0);
    }
    public static int Target(CompanyRules company, Employee employee, DateTime day) => Nominal(company, employee, day) - Excused(company, employee, day);
    public static TimeSpan NormalLimit(CompanyRules company, Employee employee, DateTime day)
    {
        var plan = WeeklyWorkPlanPolicy.For(company, employee);
        if (plan is null) return EffectiveWorkPolicy.RuleFor(company, employee).DefaultShiftDuration;
        var permission = plan.Compensation?.AppliesOn(DateOnly.FromDateTime(day)) == true ? 36000 : 28800;
        return TimeSpan.FromSeconds(Math.Min(Math.Max(0,Nominal(company,employee,day)-(employee.ContractLeaves?.Where(l=>l.Date==DateOnly.FromDateTime(day)).Sum(l=>(long)l.ExcusedSeconds)??0)), permission));
    }
    public static TimeSpan DailyLimit(CompanyRules company, Employee employee, DateTime day)
        => WeeklyWorkPlanPolicy.For(company, employee) is null ? EffectiveWorkPolicy.DailyLimit(employee)
            : TimeSpan.FromSeconds(Math.Min(36000, NormalLimit(company, employee, day).TotalSeconds + (employee.AllowsOvertime ? 7200 : 0)));
    public static TimeSpan DesiredWork(CompanyRules company, Employee employee, DateTime day)
    {
        if (WeeklyWorkPlanPolicy.For(company,employee) is null) return RegimeConfiguration.From(EffectiveWorkPolicy.RuleFor(company,employee)).DefaultShiftDuration.Value;
        var normal = TimeSpan.FromSeconds(Math.Min(Target(company,employee,day),NormalLimit(company, employee, day).TotalSeconds));
        var maximum = RegimeConfiguration.From(EffectiveWorkPolicy.RuleFor(company, employee)).MaximumShiftWork;
        return maximum is { } limit && normal > limit.Value ? limit.Value : normal;
    }
    public static IReadOnlyList<TimeSpan> CandidateDurations(EscalaLivreDocument document, Employee employee, DateTime day, DateTime start, DateTime end)
    {
        var desired=DesiredWork(document.Company,employee,day);
        if (WeeklyWorkPlanPolicy.For(document.Company,employee) is null || desired<=TimeSpan.Zero) return [desired];
        var week=ScheduleWindow.WeekStart(day);
        var history=document.Assignments.Where(a=>a.EmployeeId==employee.Id && (!ScheduleWindow.Contains(a,start,end)||LaborRules.AuthorizedHolidayShift(document.Company,a)));
        long remaining=ScheduleCapacityPolicy.RemainingWeeklyTicks(EffectiveWorkPolicy.WeeklyLimit(document.Company,employee),new Duration(TimeSpan.FromTicks(history.Sum(a=>EffectiveWorkPolicy.WorkTicksInWeek(a,week))))) / TimeSpan.TicksPerSecond;
        var sums=new HashSet<long>{0};
        for(var other=week;other<week.AddDays(7);other=other.AddDays(1))
            if(other!=day.Date && other>=start.Date && other<=end.Date)
            {
                long amount=(long)DesiredWork(document.Company,employee,other).TotalSeconds;
                foreach(var sum in sums.ToArray()) sums.Add(sum+amount);
            }
        var choices=new SortedSet<TimeSpan>{desired};
        if(WeeklyWorkPlanPolicy.For(document.Company,employee) is {FlexibleWorkDays: {} count} plan)
        {
            var basic=TimeSpan.FromSeconds(plan.ContractedSeconds/count);
            if(basic>TimeSpan.Zero&&basic<=desired) choices.Add(basic);
        }
        foreach(var sum in sums) if(remaining-sum>0 && remaining-sum<desired.TotalSeconds) choices.Add(TimeSpan.FromSeconds(remaining-sum));
        return choices.Reverse().ToArray();
    }
    public static long Recognized(CompanyRules company, Employee employee, DateTime day, long workSeconds)
        => Math.Max(0, Math.Min(workSeconds, Math.Min(Target(company,employee,day),(long)DesiredWork(company, employee, day).TotalSeconds)));
    public static IReadOnlyList<WorkloadSummary>? Summarize(EscalaLivreDocument document, DateTime start, DateTime end, IReadOnlyList<ShiftAssignment> assignments)
    {
        var summaries = new List<WorkloadSummary>();
        foreach (var employee in document.Employees)
        {
            var plan = WeeklyWorkPlanPolicy.For(document.Company, employee);
            if (plan is null) continue;
            if (plan.FlexibleWorkDays is not null) { summaries.AddRange(FlexibleContractPolicy.Summarize(document,employee,start,end,assignments)); continue; }
            var shifts = assignments.Where(a => a.EmployeeId == employee.Id).ToArray();
            var days = new List<DailyWorkload>();
            for (var day = start.Date; day <= end.Date; day = day.AddDays(1))
            {
                long nominal = Nominal(document.Company, employee, day), excused = Excused(document.Company, employee, day), expected = nominal - excused;
                long planned = shifts.Where(a => a.Start.Date == day).Sum(a => EffectiveWorkPolicy.Measure(a).Ticks / TimeSpan.TicksPerSecond);
                long recognized = Recognized(document.Company, employee, day, planned);
                days.Add(new(day, nominal, excused, expected, planned, recognized, Math.Max(0, expected - recognized), Math.Max(0, planned - recognized)));
            }
            foreach (var week in days.GroupBy(d => ScheduleWindow.WeekStart(d.Date)))
            {
                long history = shifts.Where(a => a.Start.Date < start.Date || a.Start.Date > end.Date).Sum(a => EffectiveWorkPolicy.WorkTicksInWeek(a, week.Key)) / TimeSpan.TicksPerSecond;
                summaries.Add(new(employee.Id, week.Key, plan.ContractedSeconds, week.Sum(d => d.NominalSeconds), week.Sum(d => d.ExcusedSeconds),
                    week.Sum(d => d.ExpectedSeconds), week.Sum(d => d.PlannedSeconds), week.Sum(d => d.RecognizedSeconds), week.Sum(d => d.UnmetSeconds), week.Sum(d => d.ExcessSeconds), history, week.ToArray()));
            }
        }
        return summaries.Count == 0 ? null : summaries;
    }
}
