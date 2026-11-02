using System.Text.Json;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Analysis.Tests;

public sealed class IntervalTimingPolicyTests
{
    public static IEnumerable<object[]> Scenarios()
    {
        using var json = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "interval-timing-scenarios.json")));
        return json.RootElement.GetProperty("scenarios").EnumerateArray().Select(s => new object[] { s.GetRawText() }).ToArray();
    }

    [Theory]
    [MemberData(nameof(Scenarios))]
    public void SharedCivilWorkMargin(string fixture)
    {
        using var json = JsonDocument.Parse(fixture);
        var s = json.RootElement;
        var start = s.GetProperty("start").GetDateTime();
        var pauseStart = start.AddSeconds(s.GetProperty("beforeSeconds").GetInt32());
        int duration = s.GetProperty("pauseSeconds").GetInt32();
        var pauseEnd = pauseStart.AddSeconds(duration);
        var a = new ShiftAssignment(Guid.NewGuid(), Guid.NewGuid(), "A", start,
            pauseEnd.AddSeconds(s.GetProperty("afterSeconds").GetInt32()), duration == 0 ? null : new(pauseStart, pauseEnd), "manual", []);
        Assert.Equal(s.GetProperty("allowed").GetBoolean(), IntervalTimingPolicy.HasWorkAroundPause(a));
        // A generation guard never makes inherited documents structurally unloadable.
        Assert.True(IntervalPolicy.Valid(a));
    }

    [Fact]
    public void UncoveredWorkUsesTicksInsteadOfRoundedCoverageScore()
    {
        var start = new DateTime(2026, 11, 9, 8, 0, 0);
        Assert.Equal(TimeSpan.TicksPerSecond, ScheduleCoverage.UncoveredPersonTicks(new(
            [new(start, start.AddSeconds(1), "A", 2, 1, "warning")], [], 1)));
    }
}
