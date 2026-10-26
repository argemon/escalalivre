using System.Collections.Immutable;
namespace EscalaLivre.Domain.Planning;

public sealed class ScheduledAssignment
{
    public Guid Id { get; }
    public Guid EmployeeId { get; }
    public string Role { get; }
    public Guid? RoleId { get; }
    public CivilWindow Window { get; }
    public ShiftPause? Pause { get; }
    public string Source { get; }
    public IReadOnlyList<string> Tags { get; }

    public ScheduledAssignment(Guid id, Guid employeeId, string role, CivilWindow window, ShiftPause? pause,
        string source, IEnumerable<string> tags, Guid? roleId = null)
    {
        if (id == Guid.Empty || employeeId == Guid.Empty || roleId == Guid.Empty) throw new ArgumentException("Identity must not be empty.");
        if (string.IsNullOrWhiteSpace(role)) throw new ArgumentException("A role is required.");
        Window = window ?? throw new ArgumentNullException(nameof(window));
        if (pause is not null && !window.Contains(pause.Window)) throw new ArgumentException("Pause must be contained in the shift.");
        if (source is not ("manual" or "solver")) throw new ArgumentException("Invalid assignment source.");
        var copy = (tags ?? throw new ArgumentNullException(nameof(tags))).ToArray();
        if (copy.Any(string.IsNullOrWhiteSpace)) throw new ArgumentException("Tags must not be empty.");
        Id = id;
        EmployeeId = employeeId;
        Role = role;
        RoleId = roleId;
        Pause = pause;
        Source = source;
        Tags = copy.ToImmutableArray();
    }

    // Boundary-touching pauses are representable: strict interior and legal length are diagnostics.
    public ScheduledAssignment Move(CivilWindow target)
    {
        ArgumentNullException.ThrowIfNull(target);
        var pause = Pause is null ? null : new ShiftPause(Pause.Window.MoveBy(target.Start - Window.Start));
        var tags = target.Start.Date == Window.Start.Date ? Tags : Tags.Where(t => !t.StartsWith("holiday:", StringComparison.Ordinal));
        return new(Id, EmployeeId, Role, target, pause, Source, tags, RoleId);
    }

    public ScheduledAssignment ChangeRole(string role, Guid? roleId)
        => new(Id, EmployeeId, role, Window, Pause, Source, Tags, roleId);
}
