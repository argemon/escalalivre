using System.Text.Json;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Analysis.Tests;

public sealed class ContractMinimumTests
{
    [Fact]
    public void SharedContractsRequireNormalTargetsWithOnlyTheExplicitEightHourException()
    {
        using var json=JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"contract-work-scenarios.json")));
        foreach(var scenario in json.RootElement.GetProperty("scenarios").EnumerateArray())
        {
            var request=scenario.GetProperty("request").Deserialize<ScheduleRequest>(ScheduleJson.CreateOptions())!;
            var expected=scenario.GetProperty("expected");
            Assert.Equal(expected.GetProperty("minimumRequired").GetInt64(),ContractMinimumPolicy.Requirements(request.Document,request.Start,request.End,request.Document.Assignments).Sum(m=>m.RequiredSeconds));
            Assert.Equal(expected.GetProperty("minimumMissing").GetInt64(),ContractMinimumPolicy.Missing(request.Document,request.Start,request.End,request.Document.Assignments).Sum(m=>m.RequiredSeconds));
        }
    }
}
