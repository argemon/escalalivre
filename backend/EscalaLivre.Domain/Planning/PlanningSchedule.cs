using System.Collections.Immutable;
namespace EscalaLivre.Domain.Planning;

// Assignment consistency boundary, not an aggregate of the entire portable document.
public sealed class PlanningSchedule
{
    private List<ScheduledAssignment> assignments;
    private readonly HashSet<Guid> employees;
    public Guid Id { get; }
    public CivilPlanningPeriod Period { get; private set; }
    public IReadOnlyList<ScheduledAssignment> Assignments => assignments.ToImmutableArray();

    public PlanningSchedule(Guid id, CivilPlanningPeriod period, IEnumerable<Guid> employeeIds, IEnumerable<ScheduledAssignment> assignments)
    {
        if (id == Guid.Empty) throw new ArgumentException("A planning identity is required.");
        Id = id;
        Period = period ?? throw new ArgumentNullException(nameof(period));
        var ids = (employeeIds ?? throw new ArgumentNullException(nameof(employeeIds))).ToArray();
        if (ids.Any(id => id == Guid.Empty) || ids.Distinct().Count() != ids.Length) throw new ArgumentException("Employee identities must be unique and nonempty.");
        employees = ids.ToHashSet();
        this.assignments = Validate(assignments);
    }

    private List<ScheduledAssignment> Validate(IEnumerable<ScheduledAssignment> source)
    {
        var copy = (source ?? throw new ArgumentNullException(nameof(source))).ToList();
        if (copy.Any(a => a is null || !employees.Contains(a.EmployeeId)) || copy.Select(a => a.Id).Distinct().Count() != copy.Count)
            throw new ArgumentException("Assignments need unique identities and existing owners.");
        return copy;
    }

    public void Assign(ScheduledAssignment assignment) => assignments = Validate(assignments.Append(assignment));

    public void Update(Guid id, ScheduledAssignment replacement)
    {
        ArgumentNullException.ThrowIfNull(replacement);
        if (replacement.Id != id) throw new ArgumentException("Updating cannot change an assignment identity.");
        var index = Index(id);
        var copy = assignments.ToArray();
        copy[index] = replacement;
        assignments = Validate(copy);
    }

    public void Remove(Guid id)
    {
        var index = Index(id);
        var copy = assignments.ToList();
        copy.RemoveAt(index);
        assignments = copy;
    }

    public void Move(Guid id, CivilWindow target) => Update(id, assignments[Index(id)].Move(target));
    public void ChangePeriod(CivilPlanningPeriod period) => Period = period ?? throw new ArgumentNullException(nameof(period));

    public void ReplacePeriod(IEnumerable<ScheduledAssignment> replacements)
    {
        var selected = (replacements ?? throw new ArgumentNullException(nameof(replacements))).ToArray();
        if (selected.Any(a => a is null || !Period.ContainsStart(a.Window))) throw new ArgumentException("Replacement must start within the selected period.");
        // Validate the entire new collection before committing. History on both sides stays intact.
        assignments = Validate(assignments.Where(a => !Period.ContainsStart(a.Window)).Concat(selected));
    }

    public void ChangeEmployeeRole(Guid employeeId, string role, Guid? roleId)
    {
        if (!employees.Contains(employeeId)) throw new ArgumentException("Employee does not exist.");
        if (string.IsNullOrWhiteSpace(role) || roleId == Guid.Empty) throw new ArgumentException("Role must be valid.");
        assignments = Validate(assignments.Select(a => a.EmployeeId == employeeId ? a.ChangeRole(role, roleId) : a));
    }

    private int Index(Guid id)
    {
        var index = assignments.FindIndex(a => a.Id == id);
        return index >= 0 ? index : throw new KeyNotFoundException("Assignment does not exist.");
    }
}
