using System.Collections.Immutable;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Domain.Planning;

// Configuration is a separate immutable snapshot, not a member of the assignment aggregate.
public sealed class PlanningSettings
{
    public CompanyRules Company { get; }
    public IReadOnlyList<Employee> Employees { get; }
    public RegimeConfiguration DefaultRegime { get; }
    public IReadOnlyDictionary<Guid, RegimeConfiguration> EmployeeRegimes { get; }

    public PlanningSettings(CompanyRules company, IEnumerable<Employee> employees)
    {
        ArgumentNullException.ThrowIfNull(company);
        if (string.IsNullOrWhiteSpace(company.Name) || string.IsNullOrWhiteSpace(company.TimeZone)) throw new ArgumentException("Company name and zone are required.");
        ValidateDays(company.OperatingDays);
        ArgumentNullException.ThrowIfNull(company.Lunch);
        _ = new Duration(company.MinimumRest);
        _ = new Duration(company.Lunch.Minimum);
        _ = new Duration(company.Lunch.Maximum);
        _ = new Duration(company.Lunch.PreferredAfter);
        if (company.Lunch.Maximum < company.Lunch.Minimum) throw new ArgumentException("Lunch range must be ordered.");
        if (company.Coverage.Any(c => c is null || string.IsNullOrWhiteSpace(c.Role) || !Enum.IsDefined(c.Day)
            || c.MinimumEmployees < 0 || c.RoleId == Guid.Empty || c.Scope is not ("role" or "team") || c.DaysMode is not (null or "operating" or "custom")))
            throw new ArgumentException("Coverage configuration is structurally invalid.");
        if (company.Holidays?.Any(h => h is null || string.IsNullOrWhiteSpace(h.Name)) == true) throw new ArgumentException("Holiday names are required.");
        Company = company with
        {
            OperatingDays = Copy(company.OperatingDays), Coverage = Copy(company.Coverage),
            Holidays = company.Holidays is null ? null : Copy(company.Holidays)
        };
        DefaultRegime = RegimeConfiguration.From(company.DefaultWorkload);
        var people = (employees ?? throw new ArgumentNullException(nameof(employees))).Select(Freeze).ToArray();
        if (people.Any(e => e.Id == Guid.Empty || e.RoleId == Guid.Empty || string.IsNullOrWhiteSpace(e.Name) || string.IsNullOrWhiteSpace(e.Role))
            || people.Select(e => e.Id).Distinct().Count() != people.Length)
            throw new ArgumentException("Employee identities and names must be valid and unique.");
        Employees = people.ToImmutableArray();
        EmployeeRegimes = people.ToImmutableDictionary(e => e.Id, e => RegimeConfiguration.From(e.Workload));
    }

    public PlanningSettings WithCompany(CompanyRules company) => new(company, Employees);

    public PlanningSettings WithEmployee(Guid id, Employee employee)
    {
        if (employee.Id != id || !Employees.Any(e => e.Id == id)) throw new ArgumentException("Employee update must preserve an existing identity.");
        return new(Company, Employees.Select(e => e.Id == id ? employee : e));
    }

    private static IReadOnlyList<T> Copy<T>(IEnumerable<T> values) => values.ToImmutableArray();

    private static void ValidateDays(IReadOnlyList<DayOfWeek> days)
    {
        ArgumentNullException.ThrowIfNull(days);
        if (days.Any(d => !Enum.IsDefined(d)) || days.Distinct().Count() != days.Count) throw new ArgumentException("Days must be valid and distinct.");
    }

    private static Employee Freeze(Employee employee)
    {
        ArgumentNullException.ThrowIfNull(employee);
        ValidateDays(employee.PreferredDaysOff);
        if (employee.WorkingDays is not null)
        {
            ValidateDays(employee.WorkingDays);
            if (employee.WorkingDays.Count == 0) throw new ArgumentException("Explicit working days cannot be empty.");
        }
        if (employee.CoverageRoleIds?.Any(id => id == Guid.Empty) == true || employee.CoverageRoles?.Any(string.IsNullOrWhiteSpace) == true)
            throw new ArgumentException("Coverage references must be nonempty.");
        if (employee.Preferences.Any(p => p is null || string.IsNullOrWhiteSpace(p.Code) || p.Description is null)) throw new ArgumentException("Preference structure is invalid.");
        // Windows are structurally validated, without imposing shift availability or rest policy.
        foreach (var w in employee.Availability.Concat(employee.Restrictions)) _ = new CivilWindow(w.Start, w.End);
        return employee with
        {
            Availability = Copy(employee.Availability), Restrictions = Copy(employee.Restrictions), Preferences = Copy(employee.Preferences),
            PreferredDaysOff = Copy(employee.PreferredDaysOff), WorkingDays = employee.WorkingDays is null ? null : Copy(employee.WorkingDays),
            CoverageRoles = employee.CoverageRoles is null ? null : Copy(employee.CoverageRoles),
            CoverageRoleIds = employee.CoverageRoleIds is null ? null : Copy(employee.CoverageRoleIds)
        };
    }
}
