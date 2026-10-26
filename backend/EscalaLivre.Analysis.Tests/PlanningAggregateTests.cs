using EscalaLivre.Domain.Planning;

namespace EscalaLivre.Analysis.Tests;

public sealed class PlanningAggregateTests
{
    private static readonly Guid Person = Guid.Parse("11111111-1111-4111-8111-111111111111");
    private static readonly DateTime Monday = new(2026,10,19);
    private static ScheduledAssignment Shift(int day = 0, Guid? id = null, Guid? owner = null)
        => new(id ?? Guid.NewGuid(), owner ?? Person, "A", new(Monday.AddDays(day).AddHours(22), Monday.AddDays(day+1).AddHours(6)),
            new(new(Monday.AddDays(day+1).AddHours(1), Monday.AddDays(day+1).AddHours(2))), "manual", ["keep", "holiday:2026-10-19"]);
    private static PlanningSchedule Schedule(params ScheduledAssignment[] assignments)
        => new(Guid.NewGuid(), new(new(2026,10,19), new(2026,10,19)), [Person], assignments);

    [Fact]
    public void IdentitiesWindowsAndPausePlacementAreStructural()
    {
        var w = new CivilWindow(Monday.AddHours(8), Monday.AddHours(20));
        Assert.Throws<ArgumentException>(() => new ScheduledAssignment(Guid.Empty, Person, "A", w, null, "manual", []));
        Assert.Throws<ArgumentException>(() => new ScheduledAssignment(Guid.NewGuid(), Guid.Empty, "A", w, null, "manual", []));
        Assert.Throws<ArgumentException>(() => new ScheduledAssignment(Guid.NewGuid(), Person, " ", w, null, "manual", []));
        Assert.Throws<ArgumentException>(() => new ScheduledAssignment(Guid.NewGuid(), Person, "A", w, null, "other", []));
        Assert.Throws<ArgumentException>(() => new ScheduledAssignment(Guid.NewGuid(), Person, "A", w, null, "manual", [""]));
        Assert.Throws<ArgumentException>(() => new ScheduledAssignment(Guid.NewGuid(), Person, "A", w,
            new(new(w.Start.AddSeconds(-1), w.Start.AddHours(1))), "manual", []));
        // Missing legal break and boundary-touching pause remain representable conflicts.
        Assert.Null(new ScheduledAssignment(Guid.NewGuid(), Person, "A", w, null, "manual", []).Pause);
        Assert.NotNull(new ScheduledAssignment(Guid.NewGuid(), Person, "A", w, new(new(w.Start, w.Start.AddHours(3))), "manual", []).Pause);
    }

    [Fact]
    public void AssignmentTagsRosterAndCollectionsAreDefensiveSnapshots()
    {
        var tags = new List<string> { "original" };
        var shift = new ScheduledAssignment(Guid.NewGuid(), Person, "A", new(Monday, Monday.AddHours(1)), null, "manual", tags);
        var source = new List<ScheduledAssignment> { shift };
        Guid[] owners = [Person];
        var schedule = new PlanningSchedule(Guid.NewGuid(), new(new(2026,10,19), new(2026,10,19)), owners, source);
        var snapshot = schedule.Assignments;
        tags[0] = "changed"; source.Clear(); owners[0] = Guid.NewGuid();
        Assert.Equal("original", Assert.Single(schedule.Assignments).Tags.Single());
        Assert.Throws<NotSupportedException>(() => ((IList<string>)shift.Tags).Add("corrupt"));
        Assert.Throws<NotSupportedException>(() => ((IList<ScheduledAssignment>)snapshot).Clear());
        schedule.Assign(Shift());
        Assert.Single(snapshot);
        Assert.Equal(2, schedule.Assignments.Count);
    }

    [Fact]
    public void InvalidIdentityAndReferenceOperationsDoNotCommitPartialChanges()
    {
        var shift = Shift(); var schedule = Schedule(shift);
        Assert.Throws<ArgumentException>(() => Schedule(shift, shift));
        Assert.Throws<ArgumentException>(() => new PlanningSchedule(Guid.Empty, schedule.Period, [Person], []));
        Assert.Throws<ArgumentException>(() => Schedule(Shift(owner: Guid.NewGuid())));
        Assert.Throws<ArgumentException>(() => schedule.Assign(shift));
        Assert.Throws<ArgumentException>(() => schedule.Update(shift.Id, Shift()));
        Assert.Throws<ArgumentException>(() => schedule.Update(shift.Id, Shift(id: shift.Id, owner: Guid.NewGuid())));
        Assert.Throws<KeyNotFoundException>(() => schedule.Remove(Guid.NewGuid()));
        Assert.Same(shift, Assert.Single(schedule.Assignments));
    }

    [Fact]
    public void PeriodReplacementIsAtomicAndKeepsWholeHistoryOnBothSides()
    {
        var before = Shift(-1); var old = Shift(); var after = Shift(1); var replacement = Shift();
        var schedule = Schedule(before, old, after);
        Assert.Throws<ArgumentException>(() => schedule.ReplacePeriod([replacement, Shift(2)]));
        Assert.Equal(new[] { before, old, after }, schedule.Assignments);
        Assert.Throws<ArgumentException>(() => schedule.ReplacePeriod([Shift(id: before.Id)]));
        Assert.Equal(new[] { before, old, after }, schedule.Assignments);
        schedule.ReplacePeriod([replacement]);
        Assert.Equal(new[] { before, after, replacement }, schedule.Assignments);
        Assert.Equal(Monday.AddHours(6), before.Window.End);
        Assert.Equal(Monday.AddDays(1).AddHours(6), replacement.Window.End);
        schedule.ChangePeriod(new(new(2026,10,20), new(2026,10,20)));
        Assert.Equal(3, schedule.Assignments.Count);
        schedule.Remove(after.Id);
        Assert.Equal(new[] { before, replacement }, schedule.Assignments);
    }

    [Fact]
    public void MovementPreservesSecondPrecisionAndMovesPauseAtomically()
    {
        var original = Shift(); var schedule = Schedule(original);
        var target = new CivilWindow(new(2026,12,31,23,59,59), new(2027,1,1,7,59,59));
        schedule.Move(original.Id, target);
        var moved = Assert.Single(schedule.Assignments);
        Assert.Equal(original.Id, moved.Id);
        Assert.Equal(target.Start.AddHours(3), moved.Pause!.Window.Start);
        Assert.Equal(target.Start.AddHours(4), moved.Pause.Window.End);
        Assert.Equal(new[] { "keep" }, moved.Tags);
        Assert.Equal(original.Window.Start, Monday.AddHours(22));
        Assert.Throws<ArgumentException>(() => schedule.Move(original.Id, new(target.Start, target.Start.AddHours(1))));
        Assert.Same(moved, Assert.Single(schedule.Assignments));
    }

    [Fact]
    public void ExplicitRoleChangeTouchesAllHistoryButNeverHours()
    {
        var shifts = new[] { Shift(-1), Shift(), Shift(1) }; var schedule = Schedule(shifts);
        var roleId = Guid.NewGuid();
        schedule.ChangeEmployeeRole(Person, "B", roleId);
        for (var i = 0; i < shifts.Length; i++)
        {
            var updated = schedule.Assignments[i];
            Assert.Equal(shifts[i].Id, updated.Id);
            Assert.Same(shifts[i].Window, updated.Window);
            Assert.Same(shifts[i].Pause, updated.Pause);
            Assert.Equal(shifts[i].Tags, updated.Tags);
            Assert.Equal("B", updated.Role);
            Assert.Equal(roleId, updated.RoleId);
        }
    }
}
