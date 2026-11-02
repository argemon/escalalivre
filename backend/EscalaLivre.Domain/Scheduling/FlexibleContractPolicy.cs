namespace EscalaLivre.Domain.Scheduling;

// A floating contract reserves workday slots, without inventing dates or treating closure as paid leave.
public static class FlexibleContractPolicy
{
    private static IEnumerable<DateTime> Dates(DateTime start, DateTime end)
    { for(var date=start.Date;date<=end.Date;date=date.AddDays(1)) yield return date; }
    public static long NormalWeekSeconds(CompanyRules company,Employee employee,DateTime week)
        => ExpectedInPeriod(company,employee,week,week,week.AddDays(6),Array.Empty<ShiftAssignment>());
    private static DateTime[] OutsideSlots(CompanyRules company,Employee employee,DateTime week,DateTime start,DateTime end,IEnumerable<ShiftAssignment> assignments)
    {
        var worked=assignments.Where(a=>a.EmployeeId==employee.Id&&ScheduleWindow.WeekStart(a.Start)==week).Select(a=>a.Start.Date).ToHashSet();
        return Dates(week,week.AddDays(6)).Where(d=>(d<start.Date||d>end.Date)
            &&(worked.Contains(d)||ContractWorkPolicy.Excused(company,employee,d)>0)).ToArray();
    }
    public static int SlotsInPeriod(CompanyRules company, Employee employee, DateTime week, DateTime start, DateTime end, IEnumerable<ShiftAssignment> assignments)
    {
        var plan = WeeklyWorkPlanPolicy.For(company,employee)!;
        int count = plan.FlexibleWorkDays!.Value;
        int historyDays = OutsideSlots(company,employee,week,start,end,assignments).Length;
        int dates = Dates(week,week.AddDays(6)).Count(d=>d>=start.Date && d<=end.Date);
        return Math.Min(dates,Math.Max(0,count-historyDays));
    }

    public static long NominalInPeriod(CompanyRules company, Employee employee, DateTime week, DateTime start, DateTime end, IEnumerable<ShiftAssignment> assignments)
    {
        var plan=WeeklyWorkPlanPolicy.For(company,employee)!;int count=plan.FlexibleWorkDays!.Value;
        int slots=SlotsInPeriod(company,employee,week,start,end,assignments);
        int basic=plan.ContractedSeconds/count;
        var shifts=assignments.Where(a=>a.EmployeeId==employee.Id).ToArray();
        int used=OutsideSlots(company,employee,week,start,end,shifts).Count(d=>ContractWorkPolicy.Excused(company,employee,d)
            +ContractWorkPolicy.Recognized(company,employee,d,shifts.Where(a=>a.Start.Date==d).Sum(a=>EffectiveWorkPolicy.Measure(a).Ticks/TimeSpan.TicksPerSecond))>basic);
        return (long)basic*slots+Math.Min(slots,Math.Max(0,plan.ContractedSeconds%count-used));
    }

    public static long ExtraSecondsInPeriod(CompanyRules company,Employee employee,DateTime week,DateTime start,DateTime end,IEnumerable<ShiftAssignment> assignments)
    {
        var plan=WeeklyWorkPlanPolicy.For(company,employee)!;int basic=plan.ContractedSeconds/plan.FlexibleWorkDays!.Value;
        long extras=NominalInPeriod(company,employee,week,start,end,assignments)-(long)basic*SlotsInPeriod(company,employee,week,start,end,assignments);
        return Math.Max(0,extras-Dates(week,week.AddDays(6)).Count(d=>d>=start.Date&&d<=end.Date&&ContractWorkPolicy.Excused(company,employee,d)>basic));
    }

    public static long ExpectedInPeriod(CompanyRules company, Employee employee, DateTime week, DateTime start, DateTime end, IEnumerable<ShiftAssignment> assignments)
    {
        long nominal = NominalInPeriod(company,employee,week,start,end,assignments);
        var plan=WeeklyWorkPlanPolicy.For(company,employee)!;int basic=plan.ContractedSeconds/plan.FlexibleWorkDays!.Value;
        int slots=SlotsInPeriod(company,employee,week,start,end,assignments);
        var credits = Dates(week,week.AddDays(6)).Where(d=>d>=start.Date && d<=end.Date)
            .Select(d=>(long)ContractWorkPolicy.Excused(company,employee,d)).OrderByDescending(v=>v)
            .Take(slots).ToArray();
        long excused=credits.Sum(c=>Math.Min(c,basic))+Math.Min(nominal-(long)basic*slots,credits.Count(c=>c>basic));
        return Math.Max(0,nominal-excused);
    }

    public static IReadOnlyList<WorkloadSummary> Summarize(EscalaLivreDocument document, Employee employee, DateTime start, DateTime end, IReadOnlyList<ShiftAssignment> assignments)
    {
        var company=document.Company; var plan=WeeklyWorkPlanPolicy.For(company,employee)!;
        var shifts=assignments.Where(a=>a.EmployeeId==employee.Id).ToArray();
        var result=new List<WorkloadSummary>();
        foreach(var week in Dates(start,end).Select(ScheduleWindow.WeekStart).Distinct())
        {
            long nominal=NominalInPeriod(company,employee,week,start,end,shifts),remaining=nominal;
            var dates=Dates(week,week.AddDays(6)).Where(d=>d>=start.Date&&d<=end.Date).ToArray();
            long Work(DateTime d)=>shifts.Where(a=>a.Start.Date==d).Sum(a=>EffectiveWorkPolicy.Measure(a).Ticks/TimeSpan.TicksPerSecond);
            long Credit(DateTime d)=>ContractWorkPolicy.Excused(company,employee,d);
            int slots=SlotsInPeriod(company,employee,week,start,end,shifts),basic=plan.ContractedSeconds/plan.FlexibleWorkDays!.Value;
            long extras=nominal-(long)basic*slots;
            var selected=dates.Where(d=>Work(d)>0||Credit(d)>0).OrderByDescending(Credit).ThenByDescending(Work).ThenBy(d=>d).Take(slots)
                .OrderByDescending(d=>Credit(d)>basic).ThenByDescending(d=>Work(d)+Credit(d)).ThenBy(d=>d).ToArray();
            var targets=selected.Select((d,i)=>(Date:d,Target:(long)basic+(i<extras?1:0))).ToDictionary(x=>x.Date,x=>x.Target);
            var rows=new List<DailyWorkload>();
            // Give the indivisible remainder seconds to longer selected turns; leave unscheduled slots explicit.
            foreach(var day in dates.OrderByDescending(d=>ContractWorkPolicy.Excused(company,employee,d)>0).ThenByDescending(Work).ThenBy(d=>d))
            {
                long work=Work(day),credit=ContractWorkPolicy.Excused(company,employee,day);
                long target=targets.GetValueOrDefault(day);
                remaining-=target;
                long excused=Math.Min(target,credit),expected=target-excused;
                long recognized=Math.Max(0,Math.Min(work,Math.Min(expected,(long)ContractWorkPolicy.DesiredWork(company,employee,day).TotalSeconds)));
                rows.Add(new(day,target,excused,expected,work,recognized,Math.Max(0,expected-recognized),Math.Max(0,work-recognized)));
            }
            long history=shifts.Where(a=>!ScheduleWindow.Contains(a,start,end)).Sum(a=>EffectiveWorkPolicy.WorkTicksInWeek(a,week))/TimeSpan.TicksPerSecond;
            result.Add(new(employee.Id,week,plan.ContractedSeconds,nominal,rows.Sum(d=>d.ExcusedSeconds),nominal-rows.Sum(d=>d.ExcusedSeconds),
                rows.Sum(d=>d.PlannedSeconds),rows.Sum(d=>d.RecognizedSeconds),remaining+rows.Sum(d=>d.UnmetSeconds),rows.Sum(d=>d.ExcessSeconds),history,rows.OrderBy(d=>d.Date).ToArray(),remaining));
        }
        return result;
    }
}
