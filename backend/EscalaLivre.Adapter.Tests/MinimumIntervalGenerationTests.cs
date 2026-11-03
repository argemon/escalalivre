using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Infrastructure.Solver;

namespace EscalaLivre.Adapter.Tests;

public sealed class MinimumIntervalGenerationTests
{
    private static ScheduleRequest Request(int days = 1, int closingMinute = 30, int closingHour = 16, int people = 2)
    {
        var work = new WorkloadRule("dayBased", 5, 2, 44, TimeSpan.FromHours(8));
        var start = new DateTime(2026, 11, 4);
        var weekdays = Enumerable.Range(0, days).Select(i => start.AddDays(i).DayOfWeek).ToArray();
        var company = new CompanyRules("Loja", new(7, 30), new(closingHour, closingMinute), weekdays, work,
            new(TimeSpan.FromHours(1), TimeSpan.FromHours(2), TimeSpan.FromHours(4)), TimeSpan.FromHours(11),
            weekdays.Select(day => new CoverageRequirement("Equipe", day, new(7, 30), new(closingHour, closingMinute), 1, Scope: "team")).ToArray());
        var employees = Enumerable.Range(0, people).Select(i => new Employee(Guid.NewGuid(), "Pessoa " + i, "Staff", true,
            work, [], [], [], false, false, [], ShiftStartsAt: new(7, 30))).ToArray();
        return new(new("1.0.0", Guid.NewGuid(), company, employees, [], DateTimeOffset.UtcNow), start, start.AddDays(days - 1));
    }

    [Theory]
    [InlineData(1)]
    [InlineData(3)]
    public void MinimumLunchForEveryoneWhenItAlreadyCoversTheDay(int days)
    {
        var request = Request(days);
        // The business can remain open beyond the period that actually needs this team.
        request = request with { Document = request.Document with { Company = request.Document.Company with { ClosesAt = new(17, 30) } } };
        var result = AdapterComposition.Generate().Execute(request);
        Assert.Equal(days * 2, result.Assignments.Count);
        Assert.Empty(result.Gaps);
        Assert.DoesNotContain(result.Conflicts, c => c.Severity == "error");
        Assert.All(result.Assignments, a => Assert.Equal(TimeSpan.FromHours(1), a.Break!.End - a.Break.Start));
        Assert.All(result.Assignments.GroupBy(a => a.EmployeeId), shifts =>
            Assert.Single(shifts.Select(a => (a.Break!.Start.TimeOfDay, a.Break.End - a.Break.Start)).Distinct()));
    }

    [Theory]
    [InlineData(17, 0, 30)]
    [InlineData(17, 30, 60)]
    public void ExtendOnlyAsMuchAsNeededToCoverClosing(int hour, int minute, int extraMinutes)
    {
        var request = Request(closingHour: hour, closingMinute: minute);
        var result = AdapterComposition.Generate().Execute(request);
        Assert.Equal(2, result.Assignments.Count);
        Assert.Empty(result.Gaps);
        Assert.DoesNotContain(result.Conflicts, c => c.Severity == "error");
        Assert.Equal(extraMinutes, result.Assignments.Sum(a => (a.Break!.End - a.Break.Start).TotalMinutes - 60));
        Assert.All(result.Assignments, a => Assert.True(IntervalTimingPolicy.HasWorkAroundPause(a)));
    }

    [Fact]
    public void EqualPartialCoverageDoesNotJustifyALongerLunch()
    {
        var request = Request(closingHour: 17, people: 1);
        var result = AdapterComposition.Generate().Execute(request);
        Assert.NotEmpty(result.Gaps);
        var shift = Assert.Single(result.Assignments);
        Assert.Equal(TimeSpan.FromHours(1), shift.Break!.End - shift.Break.Start);
    }

    [Fact]
    public void PreservedLongerRoutineAnchorsAPartialWeek()
    {
        var request = Request(3, closingHour: 17);
        var employee = request.Document.Employees[0];
        var previousDay = request.Start.AddDays(-1);
        var history = new ShiftAssignment(Guid.NewGuid(), employee.Id, employee.Role, previousDay.AddHours(7.5), previousDay.AddHours(17.5),
            new(previousDay.AddHours(10.5), previousDay.AddHours(12.5)), "manual", []);
        request = request with { Document = request.Document with { Assignments = [history], Company = request.Document.Company with {
            OperatingDays = request.Document.Company.OperatingDays.Append(previousDay.DayOfWeek).ToArray() } } };
        var result = AdapterComposition.Generate().Execute(request);
        Assert.Contains(result.Assignments, a => GenerationConformance.SameAssignment(history, a));
        Assert.Empty(Assert.Single(result.Assignments, a => a.Id == history.Id).Tags);
        Assert.Equal(4, result.Assignments.Count(a => a.EmployeeId == employee.Id));
        Assert.All(result.Assignments.Where(a => a.EmployeeId == employee.Id), a =>
        {
            Assert.Equal(new TimeSpan(10, 30, 0), a.Break!.Start.TimeOfDay);
            Assert.Equal(TimeSpan.FromHours(2), a.Break.End - a.Break.Start);
        });
        Assert.DoesNotContain(result.Conflicts, c => c.Severity == "error");
    }
}
