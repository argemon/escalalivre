using System.Text.Json;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Scheduling;
namespace EscalaLivre.Analysis.Tests;
public sealed class CoverageIndexTests
{
    [Fact]
    public void OwnershipIndexKeepsOverlapPauseEdgesAndIgnoresUnknownOwners()
    {
        var request=AnalysisContractTests.Request();var original=request.Document.Assignments[0];
        var complement=original with {Id=Guid.Parse("30000000-0000-4000-8000-000000000001"),Start=original.Start.Date.AddHours(12),End=original.Start.Date.AddHours(18),Break=null};
        var unknown=complement with {Id=Guid.Parse("30000000-0000-4000-8000-000000000002"),EmployeeId=Guid.Parse("30000000-0000-4000-8000-000000000099"),Start=original.Start};
        var shifts=new[]{unknown,complement,original};
        var options=ScheduleJson.CreateOptions();var before=JsonSerializer.Serialize(shifts,options);
        var result=ScheduleCoverage.Evaluate(request.Document,request.Start,request.End,shifts);
        Assert.Equal(1,result.Score);Assert.Empty(result.Gaps);Assert.All(result.Blocks,b=>Assert.Equal(1,b.Assigned));
        var reversed=ScheduleCoverage.Evaluate(request.Document,request.Start,request.End,shifts.Reverse().ToArray());
        Assert.Equal(JsonSerializer.Serialize(result,options),JsonSerializer.Serialize(reversed,options));
        Assert.Equal(before,JsonSerializer.Serialize(shifts,options));
    }
}
