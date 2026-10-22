namespace EscalaLivre.Domain.Scheduling;

public sealed record EscalaLivreDocument(
    string SchemaVersion,
    Guid Id,
    CompanyRules Company,
    IReadOnlyList<Employee> Employees,
    IReadOnlyList<ShiftAssignment> Assignments,
    DateTimeOffset UpdatedAt,
    PlanningPeriod? PlanningPeriod = null,
    IReadOnlyList<DocumentRole>? Roles = null,
    DocumentSetup? Setup = null);

public sealed record DocumentRole(Guid Id, string Name);
public sealed record DocumentSetup(bool CompanyConfigured);

public sealed record PlanningPeriod(DateOnly Start, DateOnly End);

public sealed record CompanyRules(
    string Name,
    TimeOnly OpensAt,
    TimeOnly ClosesAt,
    IReadOnlyList<DayOfWeek> OperatingDays,
    WorkloadRule DefaultWorkload,
    LunchRule Lunch,
    TimeSpan MinimumRest,
    IReadOnlyList<CoverageRequirement> Coverage,
    MiddayClosure? MiddayClosure = null,
    IReadOnlyList<Holiday>? Holidays = null,
    string TimeZone = "America/Cuiaba");

public sealed record Holiday(DateOnly Date, string Name, bool Closed = true);

public sealed record MiddayClosure(TimeOnly Start, TimeOnly End);

public sealed record Employee(
    Guid Id,
    string Name,
    string Role,
    bool InheritsCompanyDefaults,
    WorkloadRule Workload,
    IReadOnlyList<AvailabilityWindow> Availability,
    IReadOnlyList<AvailabilityWindow> Restrictions,
    IReadOnlyList<Preference> Preferences,
    bool AllowsOvertime,
    bool AllowsNightWork,
    IReadOnlyList<DayOfWeek> PreferredDaysOff,
    IReadOnlyList<DayOfWeek>? WorkingDays = null,
    TimeOnly? ShiftStartsAt = null,
    bool WorksDuringLunchClosure = false,
    MiddayClosure? FixedInterval = null,
    IReadOnlyList<string>? CoverageRoles = null,
    Guid? RoleId = null,
    IReadOnlyList<Guid>? CoverageRoleIds = null);

public sealed record WorkloadRule(
    string RegimeType,
    int WorkUnits,
    int RestUnits,
    double WeeklyLimitHours,
    TimeSpan DefaultShiftDuration);

public sealed record LunchRule(TimeSpan Minimum, TimeSpan Maximum, TimeSpan PreferredAfter);

public sealed record CoverageRequirement(string Role, DayOfWeek Day, TimeOnly Start, TimeOnly End, int MinimumEmployees, string? DaysMode = null, bool AllowsOutsideHours = false, string Scope = "role", Guid? RoleId = null);

public sealed record AvailabilityWindow(DateTime Start, DateTime End);

public sealed record Preference(string Code, int Weight, string Description);

public sealed record ShiftAssignment(
    Guid Id,
    Guid EmployeeId,
    string Role,
    DateTime Start,
    DateTime End,
    BreakWindow? Break,
    string Source,
    IReadOnlyList<string> Tags,
    Guid? RoleId = null);

public sealed record BreakWindow(DateTime Start, DateTime End);

public sealed record ScheduleIssue(string Severity, string Code, string Message, DateTime? Start = null, DateTime? End = null, string? Role = null, Guid? EmployeeId = null);

public sealed record CoverageBlock(DateTime Start, DateTime End, string Role, int Required, int Assigned, string State);

public sealed record CoverageGap(DateTime Start, DateTime End, string Role, int MissingEmployees);

public sealed record WeeklyHiringDemand(DateOnly WeekStart, double Hours);
public sealed record HiringSuggestion(string Role, double TotalHours, double WeeklyHours, double ReferenceWeeklyHours,
    int MinimumPeople, int PeakMissingEmployees, IReadOnlyList<WeeklyHiringDemand> WeeklyDemand,
    IReadOnlyList<AvailabilityWindow> IdealWindows, string Rationale);

public sealed record OptimizationSuggestion(string Code, string Message, string Impact, Guid? EmployeeId = null, DateTime? Start = null, DateTime? End = null);

public sealed record SolverDecision(Guid AssignmentId, Guid EmployeeId, string Reason, IReadOnlyList<string> Factors);
