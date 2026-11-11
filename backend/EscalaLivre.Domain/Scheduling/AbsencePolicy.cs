namespace EscalaLivre.Domain.Scheduling;
public static class AbsencePolicy {
 public static IEnumerable<AvailabilityWindow> Windows(Employee e)=>(e.Absences??[]).Select(a=>new AvailabilityWindow(a.Start,a.End));
 public static bool Blocks(Employee e,DateTime start,DateTime end)=>e.Absences?.Any(a=>a.Start<end&&start<a.End)==true;
 public static bool Valid(Employee e)=>e.Absences is not {} events || events.Count<=50 && events.All(a=>a is not null && a.Id!=Guid.Empty && a.Category is "vacation" or "medical" or "leave" or "unavailable" && a.Start.Year is >=1900 and <=2100 && a.End.Year is >=1900 and <=2100 && a.End>a.Start && a.End-a.Start<=TimeSpan.FromDays(366) && a.Credits is not null && a.Credits.Count<=366 && a.Credits.All(c=>c is not null && c.ExcusedSeconds is >=1 and <=86400 && c.Date.ToDateTime(TimeOnly.MinValue)<a.End && c.Date.ToDateTime(TimeOnly.MinValue).AddDays(1)>a.Start) && a.Credits.Select(c=>c.Date).Distinct().Count()==a.Credits.Count) && events.Select(a=>a.Id).Distinct().Count()==events.Count && events.Sum(a=>a.Credits.Count)<=366;
 public static long ExplicitCredit(Employee e,DateTime day){
  var date=DateOnly.FromDateTime(day);var from=day.Date;var to=from.AddDays(1);
  var windows=(e.Absences??[]).Select(a=>new{Start=a.Start>from?a.Start:from,End=a.End<to?a.End:to,Credit=a.Credits.FirstOrDefault(c=>c.Date==date)?.ExcusedSeconds??0}).Where(w=>w.Start<w.End&&w.Credit>0).OrderBy(w=>w.Start).ThenBy(w=>w.End);
  long sum=0,maximum=0;var end=DateTime.MinValue;foreach(var w in windows){if(w.Start<end){if(w.End>end)end=w.End;maximum=Math.Max(maximum,w.Credit);}else{sum+=maximum;end=w.End;maximum=w.Credit;}}return sum+maximum+(e.ContractLeaves?.Where(l=>l.Date==date).Sum(l=>(long)l.ExcusedSeconds)??0);
 }
}
