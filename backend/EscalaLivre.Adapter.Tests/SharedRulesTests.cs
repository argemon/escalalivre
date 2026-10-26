using System.Text.Json;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Infrastructure.Solver;
namespace EscalaLivre.Adapter.Tests;
public sealed class SharedRulesTests
{
    public static IEnumerable<object[]> Scenarios()
    {
        using var json=JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"rule-scenarios.json")));
        foreach(var scenario in json.RootElement.GetProperty("scenarios").EnumerateArray())yield return [scenario.GetProperty("id").GetString()!];
    }
    [Theory]
    [MemberData(nameof(Scenarios))]
    public void SharedDocumentsHaveExpectedDiagnosticsAndGenerationUsesTheValidator(string id)
    {
        using var json=JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"rule-scenarios.json")));
        var scenario=json.RootElement.GetProperty("scenarios").EnumerateArray().Single(s=>s.GetProperty("id").GetString()==id);
        var request=scenario.GetProperty("request").Deserialize<ScheduleRequest>(ScheduleJson.CreateOptions())!;
        var generation = AdapterComposition.Generate();var analysis=PureComposition.Analyze().Execute(request);var validation=PureComposition.Validate().Execute(request);
        var expected=scenario.GetProperty("expectedCodes").EnumerateArray().Select(v=>v.GetString()!).Order().ToArray();
        Assert.Equal(expected,analysis.Conflicts.Select(c=>c.Code).Distinct().Order().ToArray());
        Assert.Equal(analysis.Conflicts,validation.Conflicts);
        if(scenario.GetProperty("generate").GetBoolean())
        {
            var result=generation.Execute(request);
            Assert.NotEmpty(result.Assignments);
            Assert.DoesNotContain(result.Conflicts,c=>c.Severity=="error");
            var checkedAgain=PureComposition.Validate().Execute(request with {Document=request.Document with {Assignments=result.Assignments}});
            Assert.Equal(result.Conflicts,checkedAgain.Conflicts);
            Assert.Equal(result.CoverageScore,checkedAgain.CoverageScore);
        }
    }
}
