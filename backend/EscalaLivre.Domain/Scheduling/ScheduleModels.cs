namespace EscalaLivre.Domain.Scheduling;

public sealed record EscalaLivreDocument(
    string SchemaVersion,
    Guid Id,
    CompanyRules Company,
    IReadOnlyList<Employee> Employees,
    IReadOnlyList<ShiftAssignment> Assignments,
    DateTimeOffset UpdatedAt);

public sealed record CompanyRules(
    string Name,
    TimeOnly OpensAt,
    TimeOnly ClosesAt,
    IReadOnlySet<DayOfWeek> OperatingDays,
    WorkloadRule DefaultWorkload,
    LunchRule Lunch,
    TimeSpan MinimumRest,
    IReadOnlyList<CoverageRequirement> Coverage);

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
    IReadOnlySet<DayOfWeek> PreferredDaysOff);

public sealed record WorkloadRule(
    string RegimeType,
    int WorkUnits,
    int RestUnits,
    double WeeklyLimitHours,
    TimeSpan DefaultShiftDuration);

public sealed record LunchRule(TimeSpan Minimum, TimeSpan Maximum, TimeSpan PreferredAfter);

public sealed record CoverageRequirement(string Role, DayOfWeek Day, TimeOnly Start, TimeOnly End, int MinimumEmployees);

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
    IReadOnlyList<string> Tags);

public sealed record BreakWindow(DateTime Start, DateTime End);

public sealed record ScheduleIssue(string Severity, string Code, string Message, DateTime? Start = null, DateTime? End = null, string? Role = null);

public sealed record CoverageGap(DateTime Start, DateTime End, string Role, int MissingEmployees);

public sealed record HiringSuggestion(string Role, double WeeklyHours, IReadOnlyList<AvailabilityWindow> IdealWindows, string Rationale);
