using System.Text.Json;
using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Application.Contracts.Documents;
using EscalaLivre.Application.Planning;
using EscalaLivre.Application.Scheduling;

namespace EscalaLivre.Analysis.Tests;

public sealed class WeeklyWorkPlanTests
{
    [Theory]
    [InlineData(0)]
    [InlineData(8)]
    public void FlexibleDaysProtectStructuralBounds(int days)
        => Assert.Throws<ArgumentException>(()=>new WeeklyWorkPlan(144000,new int[7],flexibleWorkDays:days));
    [Fact]
    public void SharedDistributionAndConfigurationIssues()
    {
        using var json = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"weekly-work-plan-scenarios.json")));
        foreach(var s in json.RootElement.GetProperty("scenarios").EnumerateArray())
        {
            int seconds=s.GetProperty("seconds").GetInt32();
            WeeklyCompensation? compensation=s.TryGetProperty("compensation",out _) ? new("Acordo",new(2026,1,1),new(2026,12,31)) : null;
            var plan=s.TryGetProperty("custom",out var custom) ? new WeeklyWorkPlan(seconds,custom.EnumerateArray().Select(x=>x.GetInt32()).ToArray(),compensation)
                : s.TryGetProperty("friday",out var friday) ? WeeklyWorkPlanPolicy.ReducedFriday(seconds,s.GetProperty("days").EnumerateArray().Select(x=>(DayOfWeek)x.GetInt32()).ToArray(),friday.GetInt32(),compensation)
                : WeeklyWorkPlanPolicy.Uniform(seconds,s.GetProperty("days").EnumerateArray().Select(x=>(DayOfWeek)x.GetInt32()).ToArray(),compensation);
            Assert.Equal(s.GetProperty("expected").EnumerateArray().Select(x=>x.GetInt32()),plan.DailySeconds);
            Assert.Equal(s.GetProperty("issues").EnumerateArray().Select(x=>x.GetString()),WeeklyWorkPlanPolicy.Issues(plan,s.TryGetProperty("ceiling",out var ceiling)?ceiling.GetDouble():44));
        }
        foreach(var s in json.RootElement.GetProperty("compensationDates").EnumerateArray())
            Assert.Equal(s.GetProperty("expected").GetBoolean(),new WeeklyCompensation("Acordo",new(2026,1,1),new(2026,12,31)).AppliesOn(DateOnly.Parse(s.GetProperty("date").GetString()!)));
        foreach(var s in json.RootElement.GetProperty("exits").EnumerateArray())
            Assert.Equal(s.GetProperty("expected").GetString(),WeeklyWorkPlanPolicy.EndOffset(new(7,30),s.GetProperty("work").GetInt32(),3600).ToString(@"hh\:mm\:ss"));
    }
    [Fact]
    public void StructureIsProtectedButBusinessConflictsRemainEditable()
    {
        var days=new int[]{0,1,2,3,4,5,6};var plan=new WeeklyWorkPlan(158400,days);
        days[1]=999;Assert.Equal(1,plan.DailySeconds[1]);
        Assert.Throws<NotSupportedException>(()=>((IList<int>)plan.DailySeconds)[1]=10);
        Assert.Throws<ArgumentException>(()=>new WeeklyWorkPlan(1,[1]));
        Assert.Throws<ArgumentException>(()=>new WeeklyWorkPlan(1,[0,0,0,0,0,0,-1]));
        Assert.Throws<ArgumentException>(()=>new WeeklyCompensation("",new(2026,1,1),new(2026,2,1)));
        var c=new WeeklyCompensation("Acordo",new(2026,1,1),new(2026,2,1));
        Assert.True(c.AppliesOn(new(2026,1,1)));Assert.True(c.AppliesOn(new(2026,2,1)));Assert.False(c.AppliesOn(new(2026,2,2)));
        var request=AnalysisContractTests.Request();var original=request.Document.Assignments;
        var company=request.Document.Company with {DefaultWorkload=request.Document.Company.DefaultWorkload with {WeeklyPlan=plan}};
        request=request with {Document=request.Document with {Company=company}};
        var mapped=ScheduleDocumentMapper.ToProjection(ScheduleDocumentMapper.ToDto(request.Document));
        var restored=PlanningDocumentMapping.Open(request with {Document=mapped}).ToDocument();
        Assert.Equal(plan.DailySeconds,restored.Company.DefaultWorkload.WeeklyPlan!.DailySeconds);
        Assert.Equal(JsonSerializer.Serialize(original),JsonSerializer.Serialize(restored.Assignments));
        var person=mapped.Employees[0] with {InheritsCompanyDefaults=true};
        Assert.Same(mapped.Company.DefaultWorkload.WeeklyPlan,WeeklyWorkPlanPolicy.For(mapped.Company,person));
        Assert.Null(WeeklyWorkPlanPolicy.For(mapped.Company,person with {InheritsCompanyDefaults=false}));
    }
    [Fact]
    public void PortableJsonPreservesPlanAndRejectsMalformedStructure()
    {
        var options=EscalaLivre.Application.Contracts.ScheduleJson.CreateOptions();
        var legacy=AnalysisContractTests.Request().Document;
        var old=JsonSerializer.Deserialize<EscalaLivreDocument>(JsonSerializer.Serialize(legacy,options),options)!;
        Assert.Null(old.Company.DefaultWorkload.WeeklyPlan);
        var plan=WeeklyWorkPlanPolicy.Uniform(158401,[DayOfWeek.Monday,DayOfWeek.Tuesday,DayOfWeek.Wednesday,DayOfWeek.Thursday,DayOfWeek.Friday],new("Acordo",new(2026,1,1),new(2026,12,31)));
        var document=legacy with {Company=legacy.Company with {DefaultWorkload=legacy.Company.DefaultWorkload with {WeeklyPlan=plan}}};
        var text=JsonSerializer.Serialize(document,options);
        var copy=JsonSerializer.Deserialize<EscalaLivreDocument>(text,options)!;
        Assert.Equal(text,JsonSerializer.Serialize(copy,options));
        Assert.Equal(plan.DailySeconds,copy.Company.DefaultWorkload.WeeklyPlan!.DailySeconds);
        var node=System.Text.Json.Nodes.JsonNode.Parse(text)!;
        node["company"]!["defaultWorkload"]!["weeklyPlan"]!["dailySeconds"]=new System.Text.Json.Nodes.JsonArray(1);
        Assert.Throws<JsonException>(()=>JsonSerializer.Deserialize<EscalaLivreDocument>(node.ToJsonString(),options));
    }

    private sealed class RejectedOptimizer : EscalaLivre.Application.Scheduling.IScheduleOptimizer
    {
        public EscalaLivre.Application.Scheduling.ScheduleOptimizationResult Optimize(EscalaLivre.Application.Contracts.ScheduleRequest request)
            => new(request.Document.Assignments,[],"invalid",[]);
    }
    [Fact]
    public void GenerationFailureWithContractPlanPreservesAllAssignments()
    {
        var request=AnalysisContractTests.Request();
        var company=request.Document.Company with {DefaultWorkload=request.Document.Company.DefaultWorkload with {WeeklyPlan=WeeklyWorkPlanPolicy.Uniform(158400,[DayOfWeek.Monday,DayOfWeek.Tuesday,DayOfWeek.Wednesday,DayOfWeek.Thursday,DayOfWeek.Friday])}};
        request=request with {Document=request.Document with {Company=company,Employees=request.Document.Employees.Select(e=>e with {InheritsCompanyDefaults=true}).ToArray()}};
        var result=new GenerateSchedule(new RejectedOptimizer(),new ScheduleAnalyzer(new ScheduleEvaluator())).Execute(request);
        Assert.Equal("invalid",result.Optimization!.Status);
        Assert.Equal(JsonSerializer.Serialize(request.Document.Assignments),JsonSerializer.Serialize(result.Assignments));
        Assert.Empty(result.Decisions);
    }
}
