using System.Text.Json;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Infrastructure.Solver;

namespace EscalaLivre.Tests;

public sealed class PlanningInsightsTests
{
    private static readonly string FixturePath=Path.Combine(AppContext.BaseDirectory,"hiring-demand-scenarios.json");
    public static IEnumerable<object[]> Scenarios()
    {
        using var json=JsonDocument.Parse(File.ReadAllText(FixturePath));
        return json.RootElement.GetProperty("scenarios").EnumerateArray().Select(s=>new object[]{s.GetProperty("id").GetString()!}).ToArray();
    }
    [Theory]
    [MemberData(nameof(Scenarios))]
    public void HiringDemandMatchesSharedPersonHoursAndHeadcount(string id)
    {
        using var json=JsonDocument.Parse(File.ReadAllText(FixturePath));
        var scenario=json.RootElement.GetProperty("scenarios").EnumerateArray().Single(s=>s.GetProperty("id").GetString()==id);
        var gaps=scenario.GetProperty("gaps").Deserialize<List<CoverageGap>>(ScheduleJson.CreateOptions())!;
        double reference=scenario.GetProperty("referenceWeeklyHours").GetDouble();
        var suggestions=HiringDemand.Suggest(gaps,reference);
        var expected=scenario.GetProperty("expected").EnumerateArray().ToArray();
        Assert.Equal(expected.Length,suggestions.Count);
        for(int i=0;i<expected.Length;i++)
        {
            var item=expected[i];var suggestion=suggestions[i];
            Assert.Equal(item.GetProperty("role").GetString(),suggestion.Role);
            Assert.Equal(item.GetProperty("totalHours").GetDouble(),suggestion.TotalHours);
            Assert.Equal(item.GetProperty("weeklyHours").GetDouble(),suggestion.WeeklyHours);
            Assert.Equal(item.GetProperty("minimumPeople").GetInt32(),suggestion.MinimumPeople);
            Assert.Equal(item.GetProperty("peakMissingEmployees").GetInt32(),suggestion.PeakMissingEmployees);
            Assert.Equal(reference,suggestion.ReferenceWeeklyHours);
            var weeks=item.GetProperty("weeklyDemand").EnumerateArray().ToArray();
            Assert.Equal(weeks.Length,suggestion.WeeklyDemand.Count);
            for(int j=0;j<weeks.Length;j++)
            {
                Assert.Equal(DateOnly.Parse(weeks[j].GetProperty("weekStart").GetString()!),suggestion.WeeklyDemand[j].WeekStart);
                Assert.Equal(weeks[j].GetProperty("hours").GetDouble(),suggestion.WeeklyDemand[j].Hours);
            }
        }
    }
    private static ScheduleRequest Request()
    {
        using var json=JsonDocument.Parse(File.ReadAllText(FixturePath));
        var document=json.RootElement.GetProperty("document").Deserialize<EscalaLivreDocument>(ScheduleJson.CreateOptions())!;
        return new(document,new(2026,10,1),new(2026,10,31,23,59,59));
    }
    [Fact]
    public void AnalyzeHasFullMonthlyDemandAndMakesNoOptimalityClaim()
    {
        var result=new OrToolsScheduleSolver().Analyze(Request());
        var suggestion=Assert.Single(result.HiringSuggestions);
        Assert.Equal(496,suggestion.TotalHours);Assert.Equal(112,suggestion.WeeklyHours);Assert.Equal(3,suggestion.MinimumPeople);
        Assert.Equal("not-run",result.Optimization?.Status);
    }
    [Fact]
    public void ProvenOptimumCanStillHaveCoverageGapsAndValidationDoesNotKeepTheProof()
    {
        var request=Request();var solver=new OrToolsScheduleSolver();var result=solver.Solve(request);
        Assert.Equal("optimal",result.Optimization?.Status);Assert.NotEmpty(result.Gaps);Assert.Equal(0,result.CoverageScore);
        Assert.Equal("not-run",solver.Validate(request).Optimization?.Status);
    }
    [Fact]
    public void FeasibleScheduleWithFullCoverageReturnsTheActualSolverProof()
    {
        var request=Request();var day=new DateTime(2026,10,1);
        var workload=new WorkloadRule("dayBased",5,2,44,TimeSpan.FromHours(1));
        var company=request.Document.Company with {OpensAt=new(9,0),ClosesAt=new(10,0),DefaultWorkload=workload,Coverage=[new("Equipe",day.DayOfWeek,new(9,0),new(10,0),1)]};
        var employee=new Employee(Guid.NewGuid(),"Pessoa","Equipe",true,workload,[],[],[],false,false,[]);
        request=request with {Start=day,End=day.AddDays(1).AddSeconds(-1),Document=request.Document with {Company=company,Employees=[employee],PlanningPeriod=new(DateOnly.FromDateTime(day),DateOnly.FromDateTime(day))}};
        var result=new OrToolsScheduleSolver().Solve(request);
        Assert.Single(result.Assignments);Assert.Empty(result.Gaps);Assert.Equal(1,result.CoverageScore);Assert.Equal("optimal",result.Optimization?.Status);
    }
}
