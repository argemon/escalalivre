namespace EscalaLivre.Domain.Scheduling;
public static class LaborRules
{
 public static TimeSpan RequiredInterval(TimeSpan work) => work > TimeSpan.FromHours(6) ? TimeSpan.FromHours(1) : work > TimeSpan.FromHours(4) ? TimeSpan.FromMinutes(15) : TimeSpan.Zero;
 public static bool ClosedHoliday(CompanyRules company, DateTime date)
 {
        Holiday? custom =company.Holidays?.FirstOrDefault(h=>h.Date==DateOnly.FromDateTime(date));
  if(custom is not null) return custom.Closed;
  return (date.Month,date.Day) is (1,1) or (4,21) or (5,1) or (9,7) or (10,12) or (11,2) or (11,15) or (11,20) or (12,25);
 }
 public static bool AuthorizedHolidayShift(CompanyRules company, ShiftAssignment assignment)
 {
  var date=DateOnly.FromDateTime(assignment.Start);
  return assignment.Source=="manual" && assignment.Tags.Contains("holiday:"+date.ToString("yyyy-MM-dd")) && (company.Holidays?.Any(h=>h.Date==date)==true || ClosedHoliday(company,assignment.Start));
 }
 public static bool ValidInterval(ShiftAssignment a)
 {
        TimeSpan pause =a.Break is null ? TimeSpan.Zero : a.Break.End-a.Break.Start;
  return (a.Break is null || (a.Break.Start>a.Start && a.Break.End<a.End && pause>TimeSpan.Zero)) && pause >= RequiredInterval(a.End-a.Start-pause) && pause<=TimeSpan.FromHours(2);
 }
}
