namespace EscalaLivre.Domain.Scheduling;

public static class CoverageDemand
{
    private static readonly TimeSpan CoverageBlockSize = TimeSpan.FromHours(1);

    public static IEnumerable<(DateTime Start,DateTime End,List<CoverageRequirement> Rules)> Blocks(CompanyRules company, DateTime startDate, DateTime endDate,IReadOnlyList<ShiftAssignment> shifts)
    {
        var windows=new List<(DateTime Start,DateTime End,CoverageRequirement Rule,BreakWindow? Closure)>();
        var points=new SortedSet<DateTime>();
        foreach(DateTime day in Days(startDate,endDate)) {
            if(LaborRules.ClosedHoliday(company,day)) continue;
            foreach(CoverageRequirement? rule in company.Coverage.Where(r=>r.Day==day.DayOfWeek)) {
                DateTime start =day+rule.Start.ToTimeSpan(); DateTime end =ScheduleRules.EndOn(day,rule.Start,rule.End);
                BreakWindow? closure =rule.AllowsOutsideHours ? null : IntervalPolicy.ClosureOn(company,day);
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

    public static bool Covers(ShiftAssignment assignment, DateTime start, DateTime end)
    {
        if (assignment.Start > start || assignment.End < end)
        {
            return false;
        }

        return assignment.Break is null || assignment.Break.End <= start || assignment.Break.Start >= end;
    }

    private static IEnumerable<DateTime> Days(DateTime start, DateTime end)
    {
        for (DateTime day = start.Date; day < end.Date.AddDays(1); day = day.AddDays(1))
        {
            yield return day;
        }
    }
}
