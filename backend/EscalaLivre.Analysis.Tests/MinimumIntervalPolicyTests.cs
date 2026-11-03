using System.Text.Json;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Analysis.Tests;

public sealed class MinimumIntervalPolicyTests
{
    public static IEnumerable<object[]> Scenarios()
    {
        using var json = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "minimum-interval-scenarios.json")));
        return json.RootElement.GetProperty("scenarios").EnumerateArray().Select(s => new object[] { s.GetRawText() }).ToArray();
    }

    [Theory]
    [MemberData(nameof(Scenarios))]
    public void SharedExtensionPreference(string fixture)
    {
        using var json = JsonDocument.Parse(fixture);
        var s = json.RootElement;
        MiddayClosure? Window(string name) => s.TryGetProperty(name, out var window)
            ? new(TimeOnly.Parse(window.GetProperty("start").GetString()!), TimeOnly.Parse(window.GetProperty("end").GetString()!)) : null;
        var work = new WorkloadRule("dayBased", 5, 2, 44, TimeSpan.FromHours(8));
        var company = new CompanyRules("Loja", new(7, 30), new(17, 30), [DayOfWeek.Wednesday], work,
            new(TimeSpan.Parse(s.GetProperty("minimum").GetString()!), TimeSpan.Parse(s.GetProperty("maximum").GetString()!), TimeSpan.FromHours(4)),
            TimeSpan.FromHours(11), [], Window("middayClosure"));
        var employee = new Employee(Guid.NewGuid(), "A", "A", true, work, [], [], [], false, true, [],
            FixedInterval: Window("fixedInterval"), WorksDuringLunchClosure: s.TryGetProperty("worksDuringLunchClosure", out var works) && works.GetBoolean());
        var assignment = new ShiftAssignment(Guid.NewGuid(), employee.Id, "A", s.GetProperty("start").GetDateTime(), s.GetProperty("end").GetDateTime(),
            s.GetProperty("pauseStart").ValueKind == JsonValueKind.Null ? null : new(s.GetProperty("pauseStart").GetDateTime(), s.GetProperty("pauseEnd").GetDateTime()), "manual", []);
        Assert.Equal(s.GetProperty("expectedSeconds").GetInt64(), IntervalPolicy.Extension(company, employee, assignment).TotalSeconds);
    }
}
