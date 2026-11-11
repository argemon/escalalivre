using System.Text.Json;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Scheduling;
namespace EscalaLivre.Adapter.Tests;
public sealed class ExclusiveCoverageGenerationTests {
 [Theory][InlineData("exclusive-single-substitute",0.333)][InlineData("exclusive-crossed-permissions",1)][InlineData("exclusive-explicit-accumulation",0.667)][InlineData("exclusive-mixed-group-and-substitute",1)][InlineData("exclusive-group-team-counts-once",1)]public void RealSolverRespectsExclusiveCapacityAndExplicitGroups(string id,double score){using var j=JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"exclusive-coverage-scenarios.json")));var r=j.RootElement.GetProperty("scenarios").EnumerateArray().Single(s=>s.GetProperty("id").GetString()==id).GetProperty("request").Deserialize<ScheduleRequest>(ScheduleJson.CreateOptions())!;r=r with{Document=r.Document with{Assignments=[]}};var result=AdapterComposition.Generate().Execute(r);Assert.Contains(result.Optimization!.Status,new[]{"optimal","feasible"});Assert.Equal(score,result.CoverageScore);Assert.All(result.Coverage,b=>Assert.Equal(b.Assigned,b.EmployeeIds!.Distinct().Count()));var analyzed=ScheduleCoverage.Evaluate(r.Document,r.Start,r.End,result.Assignments);Assert.Equal(result.CoverageScore,analyzed.Score);}
}
