namespace EscalaLivre.Domain.Scheduling;

public static class RoleCoveragePolicy
{
    // Individual and role grants are additive and directional. No transitive inheritance.
    // Explicit individual IDs (including []) still override only that person's legacy names.
    public static bool CanCover(Employee employee, CoverageRequirement requirement, IReadOnlyList<DocumentRole>? roles = null)
    {
        if (requirement.Scope == "team" || employee.Role == requirement.Role) return true;
        bool personal = employee.CoverageRoleIds is {} ids
            ? requirement.RoleId is {} id && ids.Contains(id)
            : employee.CoverageRoles?.Contains(requirement.Role) ?? false;
        if (personal) return true;
        var ownRole = employee.RoleId is {} ownId ? roles?.FirstOrDefault(r => r.Id == ownId)
            : roles?.FirstOrDefault(r => r.Name == employee.Role);
        return requirement.RoleId is {} target && ownRole?.CoverageRoleIds?.Contains(target) == true;
    }
}
