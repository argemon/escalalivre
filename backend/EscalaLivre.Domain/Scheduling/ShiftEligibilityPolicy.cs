namespace EscalaLivre.Domain.Scheduling;

// Single-shift calendar/permission predicates, not a promise of global eligibility.
public static class ShiftEligibilityPolicy
{
    public static bool OutsideHours(CompanyRules company,ShiftAssignment a)
    {
        var cursor=a.Start;
        for(var day=a.Start.Date.AddDays(-1);day<=a.End.Date;day=day.AddDays(1))
        {
            if(!company.OperatingDays.Contains(day.DayOfWeek))continue;
            var from=day+company.OpensAt.ToTimeSpan();var to=ScheduleRules.EndOn(day,company.OpensAt,company.ClosesAt);
            if(from<=cursor&&to>cursor)cursor=to;
        }
        return cursor<a.End;
    }

    public static bool HasOperatingException(CompanyRules company, Employee employee, ShiftAssignment shift)
        => LaborRules.AuthorizedHolidayShift(company, shift) || company.Coverage.Any(r => r.AllowsOutsideHours
            && ScheduleRules.CanCover(employee, r) && r.Day == shift.Start.DayOfWeek
            && shift.Start.Date + r.Start.ToTimeSpan() <= shift.Start
            && shift.End <= ScheduleRules.EndOn(shift.Start.Date, r.Start, r.End));

    public static bool IsWorkingDay(CompanyRules company, Employee employee, DateTime start, bool operatingException)
        => !((!employee.InheritsCompanyDefaults && employee.WorkingDays is {} days && !days.Contains(start.DayOfWeek))
            || (!company.OperatingDays.Contains(start.DayOfWeek) && !operatingException));

    public static bool IsNight(DateTime start, DateTime end) => start.Hour < 6 || end > start.Date.AddHours(22);
    public static bool MatchesFixedStart(Employee employee, DateTime start)
        => employee.ShiftStartsAt is not {} entry || start == start.Date + entry.ToTimeSpan();
}
