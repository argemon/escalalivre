using System.Text.Json;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Contracts.Documents;
using EscalaLivre.Application.Planning;
using EscalaLivre.Domain.Scheduling;
namespace EscalaLivre.Analysis.Tests;
public sealed class ExclusiveCoverageTests {
 public static IEnumerable<object[]> Cases(){using var j=JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"exclusive-coverage-scenarios.json")));return j.RootElement.GetProperty("scenarios").EnumerateArray().Select(s=>new object[]{s.GetRawText()}).ToArray();}
 [Theory,MemberData(nameof(Cases))]public void SharedAllocationMatchesExpectedAndOrderDoesNotMatter(string source){using var j=JsonDocument.Parse(source);var s=j.RootElement;var r=s.GetProperty("request").Deserialize<ScheduleRequest>(ScheduleJson.CreateOptions())!;var before=JsonSerializer.Serialize(r);var result=PureComposition.Analyze().Execute(r);Assert.Equal(s.GetProperty("expectedScore").GetDouble(),result.CoverageScore);var d=r.Document;var reversed=PureComposition.Analyze().Execute(r with{Document=d with{Employees=d.Employees.Reverse().ToArray(),Assignments=d.Assignments.Reverse().ToArray(),Roles=d.Roles!.Reverse().ToArray(),Company=d.Company with{Coverage=d.Company.Coverage.Reverse().ToArray()}}});string[] Digest(ScheduleResult result)=>result.Coverage.Select(b=>b.Start+"/"+b.End+"/"+b.Role+"/"+b.Assigned+"/"+string.Join(",",b.EmployeeIds??[])).Order(StringComparer.Ordinal).ToArray();Assert.Equal(Digest(result),Digest(reversed));Assert.Equal(before,JsonSerializer.Serialize(r));if(d.Company.CoverageMode=="exclusive")Assert.All(result.Coverage,b=>Assert.Equal(b.Assigned,b.EmployeeIds!.Distinct().Count()));var mapped=ScheduleDocumentMapper.ToProjection(ScheduleDocumentMapper.ToDto(d));Assert.Equal(d.Company.CoverageMode,mapped.Company.CoverageMode);Assert.Equal(d.Employees[0].AccumulationRoleIds,mapped.Employees[0].AccumulationRoleIds);}
}
