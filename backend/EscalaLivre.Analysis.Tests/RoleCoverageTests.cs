using System.Text.Json;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Contracts.Documents;
using EscalaLivre.Application.Planning;
using EscalaLivre.Application.Validation;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Analysis.Tests;

public sealed class RoleCoverageTests
{
    public static IEnumerable<object[]> Cases()
    {
        using var json = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"role-coverage-scenarios.json")));
        return json.RootElement.GetProperty("scenarios").EnumerateArray().Select(s=>new object[]{s.GetRawText()}).ToArray();
    }

    [Theory, MemberData(nameof(Cases))]
    public void SharedRoleGrantsAgreeWithCanonicalAnalysis(string source)
    {
        using var json=JsonDocument.Parse(source);var s=json.RootElement;
        var request=s.GetProperty("request").Deserialize<ScheduleRequest>(ScheduleJson.CreateOptions())!;
        var before=JsonSerializer.Serialize(request);
        var result=PureComposition.Analyze().Execute(request);
        Assert.Equal(s.GetProperty("expectedScore").GetDouble(),result.CoverageScore);
        if(s.TryGetProperty("expectedCounts",out var counts))Assert.All(result.Coverage,b=>Assert.Equal(counts.GetProperty(b.Role).GetInt32(),b.Assigned));
        if(s.GetProperty("id").GetString()=="role-authorizes-outside-hours-demand")
            Assert.DoesNotContain(result.Conflicts,c=>c.Severity=="error" && c.Code is "outsideHours" or "workingDay");
        Assert.Equal(before,JsonSerializer.Serialize(request));
    }

    private static ScheduleRequest Fixture()
    {
        using var json=JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"role-coverage-scenarios.json")));
        return json.RootElement.GetProperty("scenarios")[0].GetProperty("request").Deserialize<ScheduleRequest>(ScheduleJson.CreateOptions())!;
    }

    [Fact]
    public void RoleGrantListsAreCopiedAtWireAndPlanningBoundaries()
    {
        var r=Fixture();var ids=r.Document.Roles![0].CoverageRoleIds!.ToList();
        r=r with {Document=r.Document with {Roles=r.Document.Roles.Select((role,i)=>i==0?role with{CoverageRoleIds=ids}:role).ToArray()}};
        var mapped=ScheduleDocumentMapper.ToProjection(ScheduleDocumentMapper.ToDto(r.Document));
        var planning=PlanningDocumentMapping.Open(r);
        ids.Clear();
        Assert.Equal(2,mapped.Roles![0].CoverageRoleIds!.Count);
        Assert.Equal(2,planning.ToDocument().Roles![0].CoverageRoleIds!.Count);
        Assert.Empty(r.Document.Employees[0].CoverageRoleIds!);
    }

    [Fact]
    public void RoleGrantValidationRejectsExcessiveListsAndEmptyIds()
    {
        var d=Fixture().Document;
        foreach(var ids in new[]{Enumerable.Repeat(Guid.NewGuid(),51).ToArray(),new[]{Guid.Empty}})
            Assert.NotNull(DocumentSafety.Error(d with{Roles=d.Roles!.Select((r,i)=>i==0?r with{CoverageRoleIds=ids}:r).ToArray()}));
    }
}
