using System.Text.Json;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Analysis.Tests;

public sealed class WeeklyIntervalPolicyTests
{
    public static IEnumerable<object[]> Scenarios()
    {
        using var json = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "weekly-interval-scenarios.json")));
        return json.RootElement.GetProperty("scenarios").EnumerateArray().Select(s => new object[] { s.GetRawText() }).ToArray();
    }

    [Theory]
    [MemberData(nameof(Scenarios))]
    public void CivilRoutineContractAndInheritedDocuments(string fixture)
    {
        using var json = JsonDocument.Parse(fixture);
        var s = json.RootElement;
        var owner = Guid.NewGuid();
        bool night = s.TryGetProperty("night", out var n) && n.GetBoolean();
        ShiftAssignment Shift(string prefix)
        {
            var day = DateTime.Parse(s.GetProperty(prefix + "Day").GetString()!, System.Globalization.CultureInfo.InvariantCulture);
            var clock = s.GetProperty(prefix + "Pause").GetString();
            var pauseStart = day.AddDays(night ? 1 : 0) + (clock is null ? TimeSpan.Zero : TimeSpan.Parse(clock));
            return new(Guid.NewGuid(), owner, "A", day.AddHours(night ? 22 : 7), day.AddDays(night ? 1 : 0).AddHours(night ? 6 : 17),
                clock is null ? null : new(pauseStart, pauseStart.AddSeconds(s.GetProperty(prefix + "Seconds").GetInt32())), "manual", []);
        }
        var a = Shift("a"); var b = Shift("b");
        bool allowed = s.GetProperty("allowed").GetBoolean();
        Assert.Equal(allowed, WeeklyIntervalPolicy.Compatible(a, b));
        Assert.Equal(allowed, WeeklyIntervalPolicy.Compatible(b, a));
        Assert.Equal(allowed, WeeklyIntervalPolicy.AllowsGeneration([a, b], new HashSet<Guid> { b.Id }));
        Assert.True(WeeklyIntervalPolicy.AllowsGeneration([a, b], new HashSet<Guid>()));
        Assert.True(WeeklyIntervalPolicy.Compatible(a, b with { EmployeeId = Guid.NewGuid() }));
    }
}
