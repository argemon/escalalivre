namespace EscalaLivre.Domain.Scheduling;
public static class ExclusiveCoveragePolicy {
 public static bool ValidGroup(Employee e)=>e.AccumulationRoleIds is not {} ids || (ids.Count==0 || ids.Count is >=2 and <=50) && ids.Distinct().Count()==ids.Count && ids.All(id=>id!=Guid.Empty);
 public static bool AccumulationAllows(Employee e,CoverageRequirement r,IReadOnlyList<DocumentRole>? roles)=>e.AccumulationRoleIds?.Contains(r.RoleId??roles?.FirstOrDefault(v=>v.Name==r.Role)?.Id??Guid.Empty)==true;
 private static string Key(CoverageRequirement r)=>(r.Scope??"role")+"/"+(r.RoleId?.ToString("D")??r.Role)+"/"+r.Role;
 public static IReadOnlyDictionary<CoverageRequirement,IReadOnlyList<Guid>> Allocate(IReadOnlyList<Employee> people,IReadOnlyList<CoverageRequirement> rules,Func<Employee,CoverageRequirement,bool> eligible,IReadOnlyList<DocumentRole>? roles){
  var ordered=rules.OrderBy(Key,StringComparer.Ordinal).ToArray();var persons=people.OrderBy(e=>e.Id.ToString("D"),StringComparer.Ordinal).ToArray();var result=ordered.ToDictionary(r=>r,r=>new List<Guid>());
  foreach(var r in ordered.Where(r=>r.Scope=="team"))result[r].AddRange(persons.Where(e=>eligible(e,r)).Select(e=>e.Id));
  foreach(var e in persons.Where(e=>e.AccumulationRoleIds?.Count>0))foreach(var r in ordered.Where(r=>r.Scope!="team"))if(AccumulationAllows(e,r,roles)&&eligible(e,r))result[r].Add(e.Id);
  var exclusive=persons.Where(e=>e.AccumulationRoleIds is null || e.AccumulationRoleIds.Count==0).ToArray();var roleRules=ordered.Where(r=>r.Scope!="team").ToArray();
  var choices=exclusive.ToDictionary(e=>e.Id,e=>roleRules.Where(r=>eligible(e,r)).ToArray());var owners=roleRules.ToDictionary(r=>r,r=>new List<Employee>());
  bool Assign(Employee e,HashSet<CoverageRequirement> seen){foreach(var r in choices[e.Id]){if(!seen.Add(r))continue;var assigned=owners[r];if(assigned.Count<r.MinimumEmployees-result[r].Count){assigned.Add(e);return true;}for(int i=0;i<assigned.Count;i++)if(Assign(assigned[i],seen)){assigned[i]=e;return true;}}return false;}
  foreach(var e in exclusive)Assign(e,[]);
  var used=new HashSet<Guid>();foreach(var (rule,staff)in owners)foreach(var e in staff){result[rule].Add(e.Id);used.Add(e.Id);}
  foreach(var e in exclusive.Where(e=>!used.Contains(e.Id))){var r=ordered.FirstOrDefault(r=>r.Scope!="team"&&r.Role==e.Role&&eligible(e,r))??ordered.FirstOrDefault(r=>r.Scope!="team"&&eligible(e,r));if(r is not null)result[r].Add(e.Id);}
  return result.ToDictionary(p=>p.Key,p=>(IReadOnlyList<Guid>)p.Value.OrderBy(id=>id.ToString("D"),StringComparer.Ordinal).ToArray());
 }
}
