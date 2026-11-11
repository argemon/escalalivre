using System.Text.Json;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Contracts.Documents;
using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Infrastructure.ImportExport;
namespace EscalaLivre.Adapter.Tests;
public sealed class PinnedGenerationTests {
 public static IEnumerable<object[]> Cases(){using var j=JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"pinned-generation-scenarios.json")));return j.RootElement.GetProperty("scenarios").EnumerateArray().Select(s=>new object[]{s.GetRawText()}).ToArray();}
 [Theory,MemberData(nameof(Cases))]public void RealGenerationPreservesEveryPinnedAndExternalShiftOrFailsWithoutReplacement(string source){using var j=JsonDocument.Parse(source);var s=j.RootElement;var r=s.GetProperty("request").Deserialize<ScheduleRequest>(ScheduleJson.CreateOptions())!;var result=AdapterComposition.Generate().Execute(r);if(s.GetProperty("expectedStatus").GetString()=="infeasible"){Assert.Equal("infeasible",result.Optimization!.Status);Assert.Equal(r.Document.Assignments,result.Assignments);}else{Assert.Contains(result.Optimization!.Status,new[]{"feasible","optimal"});foreach(var old in r.Document.Assignments)Assert.True(GenerationConformance.SameAssignment(old,result.Assignments.Single(a=>a.Id==old.Id)));Assert.DoesNotContain(result.Assignments,a=>!r.Document.Assignments.Any(old=>old.Id==a.Id) && r.Document.Assignments.Any(old=>old.Pinned==true && old.EmployeeId==a.EmployeeId && old.Start.Date==a.Start.Date));}var mapped=ScheduleDocumentMapper.ToProjection(ScheduleDocumentMapper.ToDto(r.Document));Assert.Equal(true,mapped.Assignments[0].Pinned);var native=new NativeScheduleSerializer();var file=native.Export(new(r.Document,"native"));var round=native.Import(new("pinned.escalalivre",file.ContentBase64,"native"));Assert.All(r.Document.Assignments,old=>Assert.True(GenerationConformance.SameAssignment(old,round.Assignments.Single(a=>a.Id==old.Id))));}
}
