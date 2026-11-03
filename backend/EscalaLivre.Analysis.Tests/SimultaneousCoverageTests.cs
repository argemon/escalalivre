using System.Text.Json;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Analysis.Tests;

public sealed class SimultaneousCoverageTests
{
    [Fact]
    public void SharedAuthorizedCoverageScenariosAgreeWithCanonicalAnalysis()
    {
        using var json = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "simultaneous-coverage-scenarios.json")));
        foreach (var scenario in json.RootElement.GetProperty("scenarios").EnumerateArray())
        {
            var request = scenario.GetProperty("request").Deserialize<ScheduleRequest>(ScheduleJson.CreateOptions())!;
            string before = JsonSerializer.Serialize(request);
            var result = ScheduleCoverage.Evaluate(request.Document, request.Start, request.End, request.Document.Assignments);
            Assert.Equal(scenario.GetProperty("expectedScore").GetDouble(), result.Score);
            Assert.Equal(scenario.GetProperty("expectedGaps").GetInt32(), result.Gaps.Count);
            if (scenario.TryGetProperty("expectedAssigned", out var assigned))
                Assert.All(result.Blocks, b => Assert.Equal(assigned.GetProperty(b.Role).GetInt32(), b.Assigned));
            Assert.Equal(before, JsonSerializer.Serialize(request));
        }
    }
}
