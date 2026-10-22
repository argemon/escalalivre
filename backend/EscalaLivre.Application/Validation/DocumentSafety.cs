using L = EscalaLivre.Application.Contracts.DocumentValidationLimits;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Application.Validation;

// Shared by scheduling and file endpoints. Check nulls before traversing the graph.
public static class DocumentSafety
{
    public static string? Error(EscalaLivreDocument? document)
    {
        if (document is null || document.Company is null || document.Employees is null || document.Assignments is null) return "Documento incompleto.";
        if (document.SchemaVersion != "1.0.0" || document.Id == Guid.Empty) return "Documento ou versão inválida.";
        if (document.Employees.Count > L.Employees || document.Assignments.Count > L.Assignments) return "Limite de funcionários ou turnos excedido.";
        if (document.PlanningPeriod is { } period && (period.Start.Year < 1900 || period.End.Year > 2100
            || period.End < period.Start || period.End.DayNumber - period.Start.DayNumber >= 31)) return "Período de planejamento inválido.";
        if (document.Roles is { } roles && (roles.Count > L.Roles || roles.Any(r => r is null || r.Id == Guid.Empty || !Text(r.Name))
            || roles.Select(r => r.Id).Distinct().Count() != roles.Count)) return "Cargos inválidos ou acima dos limites.";
        var company = document.Company;
        if (!EscalaLivre.Application.Contracts.ScheduleJson.ValidTimeZone(company.TimeZone)) return "Fuso horário da empresa inválido.";
        if (!Text(company.Name) || !Days(company.OperatingDays) || !Workload(company.DefaultWorkload) || company.Lunch is null
            || company.Coverage is null || company.Coverage.Count > L.Coverage || company.Holidays?.Count > L.Holidays
            || company.MinimumRest < TimeSpan.FromSeconds(L.MinimumRestSeconds) || company.MinimumRest > TimeSpan.FromSeconds(L.MaximumRestSeconds)) return "Configuração da empresa inválida ou acima dos limites.";
        if (company.Lunch.Minimum < TimeSpan.Zero || company.Lunch.Maximum < company.Lunch.Minimum
            || company.Lunch.Maximum > TimeSpan.FromSeconds(L.LunchSeconds) || company.Lunch.PreferredAfter < TimeSpan.Zero
            || company.Lunch.PreferredAfter > TimeSpan.FromSeconds(L.PreferredAfterSeconds)) return "Intervalos inválidos.";
        if (company.Coverage.Any(c => c is null || !Text(c.Role) || !Enum.IsDefined(c.Day)
            || (c.MinimumEmployees < 0 || c.MinimumEmployees > L.Employees) || c.RoleId == Guid.Empty || c.Scope is not ("role" or "team")
            || c.DaysMode is not (null or "operating" or "custom"))) return "Regras de cobertura inválidas.";
        if (company.Holidays?.Any(h => h is null || !Text(h.Name) || h.Date.Year is < 1900 or > 2100) == true) return "Feriados inválidos.";
        var ids = new HashSet<Guid>();
        foreach (var employee in document.Employees)
        {
            if (employee is null || employee.Id == Guid.Empty || !ids.Add(employee.Id) || !Text(employee.Name) || !Text(employee.Role)
                || !Workload(employee.Workload) || !Windows(employee.Availability) || !Windows(employee.Restrictions)
                || employee.Preferences is null || employee.Preferences.Count > L.Preferences
                || employee.Preferences.Any(p => p is null || !Text(p.Code) || !Text(p.Description, true) || (p.Weight < -L.PreferenceWeight || p.Weight > L.PreferenceWeight))
                || !Days(employee.PreferredDaysOff) || (employee.WorkingDays is not null && (employee.WorkingDays.Count == 0 || !Days(employee.WorkingDays)))
                || employee.RoleId == Guid.Empty || employee.CoverageRoleIds?.Count > L.CoverageRoles || employee.CoverageRoleIds?.Any(id => id == Guid.Empty) == true
                || employee.CoverageRoles?.Count > L.CoverageRoles || employee.CoverageRoles?.Any(r => !Text(r)) == true) return "Funcionários inválidos, duplicados ou acima dos limites.";
        }
        var assignmentIds = new HashSet<Guid>();
        foreach (var assignment in document.Assignments)
        {
            if (assignment is null || assignment.Id == Guid.Empty || !assignmentIds.Add(assignment.Id)
                || !ids.Contains(assignment.EmployeeId) || !Text(assignment.Role) || assignment.Source is not ("manual" or "solver") || assignment.RoleId == Guid.Empty
                || !Window(assignment.Start, assignment.End) || assignment.End - assignment.Start > TimeSpan.FromSeconds(L.AssignmentSeconds)
                || assignment.Tags is null || assignment.Tags.Count > L.Tags || assignment.Tags.Any(t => !Text(t))
                || (assignment.Break is { } pause && (!Window(pause.Start, pause.End) || pause.Start < assignment.Start || pause.End > assignment.End))) return "Turnos inválidos, duplicados ou acima dos limites.";
        }
        return null;
    }

    public static bool SafeDate(DateTime value) => value.Year is >= 1900 and <= 2100;
    private static bool Text(string? value, bool allowEmpty = false) => value is not null && value.Length <= L.Text && (allowEmpty || !string.IsNullOrWhiteSpace(value));
    private static bool Days(IReadOnlyList<DayOfWeek>? days) => days is not null && days.Count <= L.Days && days.All(d => Enum.IsDefined(d)) && days.Distinct().Count() == days.Count;
    private static bool Window(DateTime start, DateTime end) => SafeDate(start) && SafeDate(end) && end > start;
    private static bool Windows(IReadOnlyList<AvailabilityWindow>? windows) => windows is not null && windows.Count <= L.Windows && windows.All(w => w is not null && Window(w.Start, w.End));
    private static bool Workload(WorkloadRule? rule) => rule is not null && rule.RegimeType is "dayBased" or "hourBased"
        && rule.WorkUnits >= 1 && rule.WorkUnits <= L.WorkUnits && rule.RestUnits >= 0 && rule.RestUnits <= L.WorkUnits
        && double.IsFinite(rule.WeeklyLimitHours) && rule.WeeklyLimitHours > 0 && rule.WeeklyLimitHours <= L.WeeklyHours
        && rule.DefaultShiftDuration > TimeSpan.Zero && rule.DefaultShiftDuration <= TimeSpan.FromSeconds(L.ShiftDurationSeconds);
}
