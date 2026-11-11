using System.Globalization;
namespace EscalaLivre.Domain.Scheduling;
public sealed record Publication(string Id, int Number, PublicationPeriod Period, string ClosedAt, string CompanyName, string CompanyTimeZone, IReadOnlyList<PublicationPerson> People, IReadOnlyList<PublicationShift> Shifts, IReadOnlyList<PublicationAcknowledgement> Acknowledgements);
public sealed record PublicationPeriod(string Start,string End);
public sealed record PublicationPerson(string Id,string Name,string Role);
public sealed record PublicationShift(string Id,string EmployeeId,string Role,string Start,string End,PublicationBreak? Break=null);
public sealed record PublicationBreak(string Start,string End);
public sealed record PublicationAcknowledgement(string Category,int Groups,int Occurrences);
public sealed record PublicationSelection(string Start,string End,string VersionId);

public static class PublicationPolicy {
 public static (int DaysOff,int EarlyPauses) PreferenceCounts(EscalaLivreDocument d){var shifts=d.Assignments.Where(s=>d.PlanningPeriod is {} p&&DateOnly.FromDateTime(s.Start)>=p.Start&&DateOnly.FromDateTime(s.Start)<=p.End).ToArray();return (shifts.Count(s=>d.Employees.FirstOrDefault(e=>e.Id==s.EmployeeId)?.PreferredDaysOff.Contains(s.Start.DayOfWeek)==true),shifts.Count(s=>IntervalTimingPolicy.IsEarly(d.Company,s)));}
 public static string? ClosureError(IEnumerable<ScheduleIssue> conflicts,IEnumerable<PublicationAcknowledgement> pending,IReadOnlySet<string> acknowledged) {
 if(conflicts.Any(c=>c.Severity=="error"))return "Resolva os conflitos obrigatórios antes de fechar (inclusive histórico).";
 if(pending.Any(p=>!acknowledged.Contains(p.Category)))return "Reconheça explicitamente cada categoria de pendências.";return null;
 }
 public static bool Valid(Publication? v){bool Text(string? s)=>!string.IsNullOrWhiteSpace(s)&&s.Length<=256;bool Id(string? s)=>Guid.TryParseExact(s,"D",out var id)&&id!=Guid.Empty;bool Day(string? s)=>DateOnly.TryParseExact(s,"yyyy-MM-dd",CultureInfo.InvariantCulture,DateTimeStyles.None,out var d)&&d.Year is >=1900 and <=2100;bool Civil(string? s)=>DateTime.TryParseExact(s,"yyyy-MM-dd'T'HH:mm:ss",CultureInfo.InvariantCulture,DateTimeStyles.None,out var d)&&d.Year is >=1900 and <=2100;int C(string a,string b)=>StringComparer.Ordinal.Compare(a,b);
 if(v is null||!Id(v.Id)||v.Number is <1 or >10||v.Period is null||!Day(v.Period.Start)||!Day(v.Period.End)||C(v.Period.End,v.Period.Start)<0||DateOnly.Parse(v.Period.End).DayNumber-DateOnly.Parse(v.Period.Start).DayNumber>=31||!DateTime.TryParseExact(v.ClosedAt,"yyyy-MM-dd'T'HH:mm:ss.fff'Z'",CultureInfo.InvariantCulture,DateTimeStyles.None,out _)||!Text(v.CompanyName)||!Text(v.CompanyTimeZone)||v.People is null||v.Shifts is null||v.Acknowledgements is null||v.People.Count>200||v.Shifts.Count>1000||v.Acknowledgements.Count>4)return false;
 if(v.People.Any(p=>p is null||!Id(p.Id)||!Text(p.Name)||!Text(p.Role))||v.People.Select(p=>p.Id).Distinct().Count()!=v.People.Count||v.Shifts.Select(s=>s?.Id).Distinct().Count()!=v.Shifts.Count)return false;
 if(v.Shifts.Any(s=>s is null||!Id(s.Id)||!v.People.Any(p=>p.Id==s.EmployeeId)||!Text(s.Role)||!Civil(s.Start)||!Civil(s.End)||C(s.End,s.Start)<=0||(DateTime.ParseExact(s.End,"yyyy-MM-dd'T'HH:mm:ss",CultureInfo.InvariantCulture)-DateTime.ParseExact(s.Start,"yyyy-MM-dd'T'HH:mm:ss",CultureInfo.InvariantCulture)).TotalSeconds>172800||C(s.Start[..10],v.Period.Start)<0||C(s.Start[..10],v.Period.End)>0||(s.Break is {} b&&(!Civil(b.Start)||!Civil(b.End)||C(b.Start,s.Start)<0||C(b.End,s.End)>0||C(b.End,b.Start)<=0))))return false;
 return v.Acknowledgements.All(a=>a is not null&&a.Category is "staffing" or "workload" or "warning" or "preference"&&a.Groups is >=1 and <=100000&&a.Occurrences is >=1 and <=100000)&&v.Acknowledgements.Select(a=>a.Category).Distinct().Count()==v.Acknowledgements.Count;
 }
}
