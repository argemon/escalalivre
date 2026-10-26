using System.Text.Json;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Regimes;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Analysis.Tests;

// These tests record existing behavior, including known limitations. They do not approve it as a new rule.
public sealed class CoverageCharacterizationTests
{
    private static readonly DateTime Monday = new(2026, 10, 19);
    private static ShiftAssignment Shift(Guid employee, DateTime start, DateTime end)
        => new(Guid.NewGuid(), employee, "A", start, end, null, "manual", []);

    [Fact]
    public void OneSecondBreakRemovesCoverageEvenWhenRoundedScoreIsOne()
    {
        using var json = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "rule-scenarios.json")));
        var scenario = json.RootElement.GetProperty("scenarios").EnumerateArray().Single(s => s.GetProperty("id").GetString() == "one-second-break-removes-coverage");
        var request = scenario.GetProperty("request").Deserialize<ScheduleRequest>(ScheduleJson.CreateOptions())!;
        var result = PureComposition.Analyze().Execute(request);
        var gap = Assert.Single(result.Gaps);
        Assert.Equal(Monday.AddHours(9), gap.Start);
        Assert.Equal(gap.Start.AddSeconds(1), gap.End);
        Assert.Equal(1, gap.MissingEmployees);
        Assert.Contains(result.Coverage, b => b.Start == gap.Start && b.End == gap.End && b.Assigned == 0);
        Assert.Equal(1, result.CoverageScore);
        Assert.Empty(result.Conflicts);
    }

}
