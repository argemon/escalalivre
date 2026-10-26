namespace EscalaLivre.Application.Contracts.Documents;

// Wire/file contracts only. Construction does not enforce scheduling conformity.
public sealed record EscalaLivreDocumentDto(
    string SchemaVersion,
    Guid Id,
    CompanyRulesDto Company,
    IReadOnlyList<EmployeeDto> Employees,
    IReadOnlyList<ShiftAssignmentDto> Assignments,
    DateTimeOffset UpdatedAt,
    PlanningPeriodDto? PlanningPeriod = null,
    IReadOnlyList<DocumentRoleDto>? Roles = null,
    DocumentSetupDto? Setup = null);

public sealed record DocumentRoleDto(Guid Id, string Name);
public sealed record DocumentSetupDto(bool CompanyConfigured);

public sealed record PlanningPeriodDto(DateOnly Start, DateOnly End);

public sealed record CompanyRulesDto(
    string Name,
    TimeOnly OpensAt,
    TimeOnly ClosesAt,
    IReadOnlyList<DayOfWeek> OperatingDays,
    WorkloadRuleDto DefaultWorkload,
    LunchRuleDto Lunch,
    TimeSpan MinimumRest,
    IReadOnlyList<CoverageRequirementDto> Coverage,
    MiddayClosureDto? MiddayClosure = null,
    IReadOnlyList<HolidayDto>? Holidays = null,
    string TimeZone = "America/Cuiaba");

public sealed record HolidayDto(DateOnly Date, string Name, bool Closed = true);

public sealed record MiddayClosureDto(TimeOnly Start, TimeOnly End);

public sealed record EmployeeDto(
    Guid Id,
    string Name,
    string Role,
    bool InheritsCompanyDefaults,
    WorkloadRuleDto Workload,
    IReadOnlyList<AvailabilityWindowDto> Availability,
    IReadOnlyList<AvailabilityWindowDto> Restrictions,
    IReadOnlyList<PreferenceDto> Preferences,
    bool AllowsOvertime,
    bool AllowsNightWork,
    IReadOnlyList<DayOfWeek> PreferredDaysOff,
    IReadOnlyList<DayOfWeek>? WorkingDays = null,
    TimeOnly? ShiftStartsAt = null,
    bool WorksDuringLunchClosure = false,
    MiddayClosureDto? FixedInterval = null,
    IReadOnlyList<string>? CoverageRoles = null,
    Guid? RoleId = null,
    IReadOnlyList<Guid>? CoverageRoleIds = null);

public sealed record WorkloadRuleDto(
    string RegimeType,
    int WorkUnits,
    int RestUnits,
    double WeeklyLimitHours,
    TimeSpan DefaultShiftDuration);

public sealed record LunchRuleDto(TimeSpan Minimum, TimeSpan Maximum, TimeSpan PreferredAfter);

public sealed record CoverageRequirementDto(string Role, DayOfWeek Day, TimeOnly Start, TimeOnly End, int MinimumEmployees, string? DaysMode = null, bool AllowsOutsideHours = false, string Scope = "role", Guid? RoleId = null);

public sealed record AvailabilityWindowDto(DateTime Start, DateTime End);

public sealed record PreferenceDto(string Code, int Weight, string Description);

public sealed record ShiftAssignmentDto(
    Guid Id,
    Guid EmployeeId,
    string Role,
    DateTime Start,
    DateTime End,
    BreakWindowDto? Break,
    string Source,
    IReadOnlyList<string> Tags,
    Guid? RoleId = null);

public sealed record BreakWindowDto(DateTime Start, DateTime End);
