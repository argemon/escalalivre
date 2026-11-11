namespace EscalaLivre.Domain.Scheduling;
public static class EmploymentPolicy
{
 public static bool ActiveOn(Employee e,DateTime start) => e.InactiveFrom is not {} date || DateOnly.FromDateTime(start)<date;
 public static Employee On(Employee e,DateTime start) {
  var tenure=e.RoleHistory?.Where(t=>t.StartsOn<=DateOnly.FromDateTime(start)).OrderByDescending(t=>t.StartsOn).FirstOrDefault();
  return tenure is null ? e : e with{Role=tenure.Role,RoleId=tenure.RoleId,CoverageRoleIds=tenure.CoverageRoleIds??e.CoverageRoleIds};
 }
 public static Employee ForShift(Employee e,ShiftAssignment a) => On(e,a.Start) with{Role=a.Role,RoleId=a.RoleId};
 public static bool ValidHistory(Employee e) => (e.InactiveFrom is not {} date || date.Year is >=1900 and <=2100)
  && (e.RoleHistory is not {} history || history.Count<=366 && history.Select(t=>t?.StartsOn).Distinct().Count()==history.Count
   && history.All(t=>t is not null && t.StartsOn.Year is >=1900 and <=2100 && t.RoleId!=Guid.Empty && !string.IsNullOrWhiteSpace(t.Role) && t.Role.Length<=256 && (t.CoverageRoleIds is null || t.CoverageRoleIds.Count<=50 && t.CoverageRoleIds.All(id=>id!=Guid.Empty))));
}
