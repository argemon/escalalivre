using System.Text.Json;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Scheduling;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Analysis.Tests;

public sealed class ContractWorkTests
{
    public static IEnumerable<object[]> Scenarios()
    {
        using var json=JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"contract-work-scenarios.json")));
        return json.RootElement.GetProperty("scenarios").EnumerateArray().Select(s=>new object[]{s.GetRawText()}).ToArray();
    }
    [Fact]
    public void CandidateDurationsUseWeeklyRemainderFromBothHistoricalEdgesWithoutChangingTarget()
    {
        using var json=JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"contract-work-scenarios.json")));
        var options=ScheduleJson.CreateOptions();
        var request=json.RootElement.GetProperty("scenarios").EnumerateArray().Single(s=>s.GetProperty("id").GetString()=="partial-bilateral-history").GetProperty("request").Deserialize<ScheduleRequest>(options)!;
        var employee=request.Document.Employees[0] with {AllowsOvertime=true};
        var assignments=request.Document.Assignments.Where(a=>!ScheduleWindow.Contains(a,request.Start,request.End)).Select(a=>a with {End=a.Start.Date.AddHours(17.5)}).ToArray();
        var document=request.Document with {Employees=[employee],Assignments=assignments};
        Assert.Throws<ArgumentException>(()=>new ContractLeave(new(2026,11,10),0));
        Assert.Throws<ArgumentException>(()=>new ContractLeave(DateOnly.MinValue,3600));
        var choices=ContractWorkPolicy.CandidateDurations(document,employee,request.Start,request.Start,request.End);
        Assert.Contains(TimeSpan.FromSeconds(30240),choices);Assert.Contains(TimeSpan.FromSeconds(31680),choices);
        Assert.Equal(31680,ContractWorkPolicy.Target(document.Company,employee,request.Start));
        Assert.All(choices,c=>Assert.InRange(c.TotalSeconds,1,31680));
    }
    [Theory]
    [MemberData(nameof(Scenarios))]
    public void SharedExpectedPlannedAndUnmetWorkAndDiagnosticContract(string fixture)
    {
        using var json=JsonDocument.Parse(fixture);var s=json.RootElement;var options=ScheduleJson.CreateOptions();
        var request=s.GetProperty("request").Deserialize<ScheduleRequest>(options)!;var before=JsonSerializer.Serialize(request,options);
        var result=new ScheduleAnalyzer(new ScheduleEvaluator()).Analyze(request);var expected=s.GetProperty("expected");
        var summary=Assert.Single(result.Workloads!);
        Assert.Equal(expected.GetProperty("expected").GetInt64(),summary.ExpectedSeconds);
        Assert.Equal(expected.GetProperty("planned").GetInt64(),summary.PlannedSeconds);
        Assert.Equal(expected.GetProperty("unmet").GetInt64(),summary.UnmetSeconds);
        Assert.Equal(expected.GetProperty("excused").GetInt64(),summary.ExcusedSeconds);
        Assert.Equal(expected.TryGetProperty("history",out var history)?history.GetInt64():0,summary.HistoricalWorkSeconds);
        Assert.Equal(expected.GetProperty("errors").EnumerateArray().Select(x=>x.GetString()).Order(),result.Conflicts.Where(c=>c.Severity=="error").Select(c=>c.Code).Distinct().Order());
        Assert.Equal(summary.UnmetSeconds>0,result.Conflicts.Any(c=>c.Code=="workloadShortfall"));
        if(expected.TryGetProperty("transitionCodes",out var codes))
            Assert.Equal(codes.EnumerateArray().Select(c=>c.GetString()).Order(),result.Conflicts.Where(c=>c.Code.EndsWith("Transition")).Select(c=>c.Code).Distinct().Order());
        Assert.Equal(before,JsonSerializer.Serialize(request,options));
        Assert.Equal(before,JsonSerializer.Serialize(JsonSerializer.Deserialize<ScheduleRequest>(before,options),options));
    }
}
