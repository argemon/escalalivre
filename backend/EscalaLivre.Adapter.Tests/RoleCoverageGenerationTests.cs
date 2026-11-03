using System.Text.Json;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Adapter.Tests;

public sealed class RoleCoverageGenerationTests
{
    [Theory]
    [InlineData(false, false)]
    [InlineData(true, false)]
    [InlineData(false, true)]
    [InlineData(true, true)]
    public void OneManagerCoversCashierAndSellerWithoutIndividualAuthorizations(bool outsideHours, bool contracted)
    {
        using var json=JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"role-coverage-scenarios.json")));
        var scenario=json.RootElement.GetProperty("scenarios").EnumerateArray().Single(s=>s.GetProperty("id").GetString()==
            (outsideHours?"role-authorizes-outside-hours-demand":"manager-covers-cashier-and-seller-alone"));
        var r=scenario.GetProperty("request").Deserialize<ScheduleRequest>(ScheduleJson.CreateOptions())!;
        r=r with{Document=r.Document with{Assignments=[],Employees=[r.Document.Employees[0]]}};
        if(contracted)r=r with{Document=r.Document with{Company=r.Document.Company with{
            DefaultWorkload=r.Document.Company.DefaultWorkload with{WeeklyPlan=new(14400,[0,0,0,14400,0,0,0])}}}};
        var result=AdapterComposition.Generate().Execute(r);
        Assert.Contains(result.Optimization!.Status,new[]{"optimal","feasible"});
        Assert.Equal(1,result.CoverageScore);Assert.Empty(result.Gaps);
        Assert.Single(result.Assignments);
        Assert.DoesNotContain(result.Conflicts,c=>c.Severity=="error");
        Assert.Empty(r.Document.Employees[0].CoverageRoleIds!);
    }
}
