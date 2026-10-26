using System.Collections.Immutable;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Application.Contracts.Documents;

public static class ScheduleDocumentMapper
{
    public static EscalaLivreDocument ToProjection(EscalaLivreDocumentDto? value)
        => value is null ? null! : new(
            value.SchemaVersion,
            value.Id,
            ToProjection(value.Company),
            Map(value.Employees, item => ToProjection(item)),
            Map(value.Assignments, item => ToProjection(item)),
            value.UpdatedAt,
            ToProjection(value.PlanningPeriod),
            Map(value.Roles, item => ToProjection(item)),
            ToProjection(value.Setup));

    public static DocumentRole ToProjection(DocumentRoleDto? value)
        => value is null ? null! : new(
            value.Id,
            value.Name);

    public static DocumentSetup ToProjection(DocumentSetupDto? value)
        => value is null ? null! : new(
            value.CompanyConfigured);

    public static PlanningPeriod ToProjection(PlanningPeriodDto? value)
        => value is null ? null! : new(
            value.Start,
            value.End);

    public static CompanyRules ToProjection(CompanyRulesDto? value)
        => value is null ? null! : new(
            value.Name,
            value.OpensAt,
            value.ClosesAt,
            Copy(value.OperatingDays),
            ToProjection(value.DefaultWorkload),
            ToProjection(value.Lunch),
            value.MinimumRest,
            Map(value.Coverage, item => ToProjection(item)),
            ToProjection(value.MiddayClosure),
            Map(value.Holidays, item => ToProjection(item)),
            value.TimeZone);

    public static Holiday ToProjection(HolidayDto? value)
        => value is null ? null! : new(
            value.Date,
            value.Name,
            value.Closed);

    public static MiddayClosure ToProjection(MiddayClosureDto? value)
        => value is null ? null! : new(
            value.Start,
            value.End);

    public static Employee ToProjection(EmployeeDto? value)
        => value is null ? null! : new(
            value.Id,
            value.Name,
            value.Role,
            value.InheritsCompanyDefaults,
            ToProjection(value.Workload),
            Map(value.Availability, item => ToProjection(item)),
            Map(value.Restrictions, item => ToProjection(item)),
            Map(value.Preferences, item => ToProjection(item)),
            value.AllowsOvertime,
            value.AllowsNightWork,
            Copy(value.PreferredDaysOff),
            Copy(value.WorkingDays),
            value.ShiftStartsAt,
            value.WorksDuringLunchClosure,
            ToProjection(value.FixedInterval),
            Copy(value.CoverageRoles),
            value.RoleId,
            Copy(value.CoverageRoleIds));

    public static WorkloadRule ToProjection(WorkloadRuleDto? value)
        => value is null ? null! : new(
            value.RegimeType,
            value.WorkUnits,
            value.RestUnits,
            value.WeeklyLimitHours,
            value.DefaultShiftDuration);

    public static LunchRule ToProjection(LunchRuleDto? value)
        => value is null ? null! : new(
            value.Minimum,
            value.Maximum,
            value.PreferredAfter);

    public static CoverageRequirement ToProjection(CoverageRequirementDto? value)
        => value is null ? null! : new(
            value.Role,
            value.Day,
            value.Start,
            value.End,
            value.MinimumEmployees,
            value.DaysMode,
            value.AllowsOutsideHours,
            value.Scope,
            value.RoleId);

    public static AvailabilityWindow ToProjection(AvailabilityWindowDto? value)
        => value is null ? null! : new(
            value.Start,
            value.End);

    public static Preference ToProjection(PreferenceDto? value)
        => value is null ? null! : new(
            value.Code,
            value.Weight,
            value.Description);

    public static ShiftAssignment ToProjection(ShiftAssignmentDto? value)
        => value is null ? null! : new(
            value.Id,
            value.EmployeeId,
            value.Role,
            value.Start,
            value.End,
            ToProjection(value.Break),
            value.Source,
            Copy(value.Tags),
            value.RoleId);

    public static BreakWindow ToProjection(BreakWindowDto? value)
        => value is null ? null! : new(
            value.Start,
            value.End);

    public static EscalaLivreDocumentDto ToDto(EscalaLivreDocument? value)
        => value is null ? null! : new(
            value.SchemaVersion,
            value.Id,
            ToDto(value.Company),
            Map(value.Employees, item => ToDto(item)),
            Map(value.Assignments, item => ToDto(item)),
            value.UpdatedAt,
            ToDto(value.PlanningPeriod),
            Map(value.Roles, item => ToDto(item)),
            ToDto(value.Setup));

    public static DocumentRoleDto ToDto(DocumentRole? value)
        => value is null ? null! : new(
            value.Id,
            value.Name);

    public static DocumentSetupDto ToDto(DocumentSetup? value)
        => value is null ? null! : new(
            value.CompanyConfigured);

    public static PlanningPeriodDto ToDto(PlanningPeriod? value)
        => value is null ? null! : new(
            value.Start,
            value.End);

    public static CompanyRulesDto ToDto(CompanyRules? value)
        => value is null ? null! : new(
            value.Name,
            value.OpensAt,
            value.ClosesAt,
            Copy(value.OperatingDays),
            ToDto(value.DefaultWorkload),
            ToDto(value.Lunch),
            value.MinimumRest,
            Map(value.Coverage, item => ToDto(item)),
            ToDto(value.MiddayClosure),
            Map(value.Holidays, item => ToDto(item)),
            value.TimeZone);

    public static HolidayDto ToDto(Holiday? value)
        => value is null ? null! : new(
            value.Date,
            value.Name,
            value.Closed);

    public static MiddayClosureDto ToDto(MiddayClosure? value)
        => value is null ? null! : new(
            value.Start,
            value.End);

    public static EmployeeDto ToDto(Employee? value)
        => value is null ? null! : new(
            value.Id,
            value.Name,
            value.Role,
            value.InheritsCompanyDefaults,
            ToDto(value.Workload),
            Map(value.Availability, item => ToDto(item)),
            Map(value.Restrictions, item => ToDto(item)),
            Map(value.Preferences, item => ToDto(item)),
            value.AllowsOvertime,
            value.AllowsNightWork,
            Copy(value.PreferredDaysOff),
            Copy(value.WorkingDays),
            value.ShiftStartsAt,
            value.WorksDuringLunchClosure,
            ToDto(value.FixedInterval),
            Copy(value.CoverageRoles),
            value.RoleId,
            Copy(value.CoverageRoleIds));

    public static WorkloadRuleDto ToDto(WorkloadRule? value)
        => value is null ? null! : new(
            value.RegimeType,
            value.WorkUnits,
            value.RestUnits,
            value.WeeklyLimitHours,
            value.DefaultShiftDuration);

    public static LunchRuleDto ToDto(LunchRule? value)
        => value is null ? null! : new(
            value.Minimum,
            value.Maximum,
            value.PreferredAfter);

    public static CoverageRequirementDto ToDto(CoverageRequirement? value)
        => value is null ? null! : new(
            value.Role,
            value.Day,
            value.Start,
            value.End,
            value.MinimumEmployees,
            value.DaysMode,
            value.AllowsOutsideHours,
            value.Scope,
            value.RoleId);

    public static AvailabilityWindowDto ToDto(AvailabilityWindow? value)
        => value is null ? null! : new(
            value.Start,
            value.End);

    public static PreferenceDto ToDto(Preference? value)
        => value is null ? null! : new(
            value.Code,
            value.Weight,
            value.Description);

    public static ShiftAssignmentDto ToDto(ShiftAssignment? value)
        => value is null ? null! : new(
            value.Id,
            value.EmployeeId,
            value.Role,
            value.Start,
            value.End,
            ToDto(value.Break),
            value.Source,
            Copy(value.Tags),
            value.RoleId);

    public static BreakWindowDto ToDto(BreakWindow? value)
        => value is null ? null! : new(
            value.Start,
            value.End);

    private static IReadOnlyList<T> Copy<T>(IReadOnlyList<T>? values)
        => values is null ? null! : values.ToImmutableArray();

    private static IReadOnlyList<TOut> Map<TIn, TOut>(IReadOnlyList<TIn>? values, Func<TIn, TOut> map)
        => values is null ? null! : values.Select(map).ToImmutableArray();
}
