using System.Text.Json;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Planning;
using EscalaLivre.Application.Scheduling;
using EscalaLivre.Domain.Scheduling;
namespace EscalaLivre.Analysis.Tests;
public sealed class ParityBoundaryTests
{
    public static IEnumerable<object[]> Cases() {
        using var json = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "parity-boundaries.json")));
        return json.RootElement.GetProperty("scenarios").EnumerateArray().Select(s => new object[] { s.GetRawText() }).ToArray();
    }
    [Theory, MemberData(nameof(Cases))]
    public void SharedBoundaryAnchorsAndPreservation(string scenario) {
        using var json = JsonDocument.Parse(scenario);var item = json.RootElement;
        var options = ScheduleJson.CreateOptions();var request = item.GetProperty("request").Deserialize<ScheduleRequest>(options)!;
        var before = JsonSerializer.Serialize(request, options);
        var result = new AnalyzeSchedule(new ScheduleAnalyzer(new ScheduleEvaluator())).Execute(request);
        if(item.TryGetProperty("expectedScore",out var score))Assert.Equal(score.GetDouble(),result.CoverageScore);
        if(item.TryGetProperty("requiredCodes",out var required))foreach(var code in required.EnumerateArray())Assert.Contains(result.Conflicts,c=>c.Code==code.GetString());
        if(item.TryGetProperty("forbiddenCodes",out var forbidden))foreach(var code in forbidden.EnumerateArray())Assert.DoesNotContain(result.Conflicts,c=>c.Code==code.GetString());
        if(item.TryGetProperty("expectedGap",out var gap))Assert.Contains(result.Gaps,g=>JsonSerializer.Serialize(g,options)==JsonSerializer.Serialize(gap,options));
        var mapping=PlanningDocumentMapping.Open(request);
        Assert.Equal(JsonSerializer.Serialize(request.Document.Assignments,options),JsonSerializer.Serialize(mapping.ToDocument().Assignments,options));
        Assert.Equal(before,JsonSerializer.Serialize(request,options));
    }
}
