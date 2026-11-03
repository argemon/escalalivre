using System.Text.Json;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Infrastructure.Solver;

namespace EscalaLivre.Adapter.Tests;

public sealed class SimultaneousCoverageGenerationTests
{
    [Theory]
    [InlineData(1, 1)]
    [InlineData(3, 1)]
    [InlineData(1, 2)]
    [InlineData(3, 2)]
    public void EdsonAndAlexCoverBothRolesWithLunchAtElevenAndTwelve(int days, int maximumPauseHours)
    {
        using var json = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "simultaneous-coverage-scenarios.json")));
        var request = json.RootElement.GetProperty("scenarios")[0].GetProperty("request").Deserialize<ScheduleRequest>(ScheduleJson.CreateOptions())!;
        var company = request.Document.Company;
        var weekdays = Enumerable.Range(0, days).Select(i => request.Start.AddDays(i).DayOfWeek).ToArray();
        request = request with
        {
            End = request.End.AddDays(days - 1),
            Document = request.Document with
            {
                Assignments = [],
                PlanningPeriod = new(DateOnly.FromDateTime(request.Start), DateOnly.FromDateTime(request.End.AddDays(days - 1))),
                Company = company with { OperatingDays = weekdays, ClosesAt = new(15 + maximumPauseHours, 30),
                    Lunch = company.Lunch with { Maximum = TimeSpan.FromHours(maximumPauseHours) },
                    Coverage = weekdays.SelectMany(day => company.Coverage.Select(r => r with { Day = day, End = new(15 + maximumPauseHours, 30) })).ToArray() }
            }
        };
        var result = AdapterComposition.Generate().Execute(request);
        Assert.Equal(1, result.CoverageScore);
        Assert.Empty(result.Gaps);
        Assert.DoesNotContain(result.Conflicts, c => c.Severity == "error");
        Assert.Equal(days * 2, result.Assignments.Count);
        foreach (var day in result.Assignments.GroupBy(a => a.Start.Date))
        {
            var pauses = day.Select(a => a.Break!).OrderBy(p => p.Start).ToArray();
            Assert.Equal(new TimeSpan(11, 0, 0), pauses[0].Start.TimeOfDay);
            Assert.Equal(new TimeSpan(12, 0, 0), pauses[1].Start.TimeOfDay);
            Assert.Equal(pauses[0].End, pauses[1].Start);
        }
        Assert.All(result.Assignments.GroupBy(a => a.EmployeeId), shifts =>
            Assert.Single(shifts.Select(a => a.Break!.Start.TimeOfDay).Distinct()));
        Assert.Empty(request.Document.Assignments);
    }

    [Fact]
    public void MinuteOfLunchDelayOutweighsClosingTieBreaker()
    {
        var work = new WorkloadRule("dayBased", 5, 2, 44, TimeSpan.FromHours(8));
        var company = new CompanyRules("Loja", new(7, 30), new(17, 30), [DayOfWeek.Wednesday], work,
            new(TimeSpan.FromHours(1), TimeSpan.FromHours(2), TimeSpan.FromHours(3.5)), TimeSpan.FromHours(11), []);
        var e = new Employee(Guid.NewGuid(), "Edson", "STAFF", true, work, [], [], [], false, false, []);
        var start = new DateTime(2026, 11, 4, 7, 30, 0);
        var onTime = new ShiftAssignment(Guid.NewGuid(), e.Id, e.Role, start, start.AddHours(9),
            new(start.AddHours(3.5), start.AddHours(4.5)), "solver", []);
        var late = onTime with { Break = new(onTime.Break!.Start.AddMinutes(1), onTime.Break.End.AddMinutes(1)), Tags = ["closing"] };
        Assert.True(ScheduleObjective.CandidateWeight(company, e, onTime) > ScheduleObjective.CandidateWeight(company, e, late));
        // Translating the same shift across midnight must preserve the preference score.
        var night = onTime with { Start = onTime.Start.AddHours(15), End = onTime.End.AddHours(15),
            Break = new(onTime.Break.Start.AddHours(15), onTime.Break.End.AddHours(15)) };
        Assert.Equal(ScheduleObjective.CandidateWeight(company, e, onTime), ScheduleObjective.CandidateWeight(company, e, night));
    }
}
