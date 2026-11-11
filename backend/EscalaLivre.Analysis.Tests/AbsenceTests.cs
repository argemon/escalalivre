using System.Text.Json;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Contracts.Documents;
using EscalaLivre.Application.Planning;
using EscalaLivre.Domain.Scheduling;
namespace EscalaLivre.Analysis.Tests;
public sealed class AbsenceTests {
 public static IEnumerable<object[]> Cases(){using var j=JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"absence-scenarios.json")));return j.RootElement.GetProperty("scenarios").EnumerateArray().Select(s=>new object[]{s.GetRawText()}).ToArray();}
 [Theory,MemberData(nameof(Cases))]public void SharedAbsenceCreditAndIdentityArePreserved(string source){using var j=JsonDocument.Parse(source);var s=j.RootElement;var r=s.GetProperty("request").Deserialize<ScheduleRequest>(ScheduleJson.CreateOptions())!;var e=r.Document.Employees[0];var day=new DateTime(2026,11,4);Assert.Equal(s.GetProperty("expectedCredit").GetInt64(),AbsencePolicy.ExplicitCredit(e,day));Assert.Equal(s.GetProperty("expectedExcused").GetInt32(),ContractWorkPolicy.Excused(r.Document.Company,e,day));if(s.GetProperty("id").GetString()=="absence-night-crosses-next-day")Assert.False(AvailabilityPolicy.Allows(e,new(2026,11,4,22,0,0),new(2026,11,5,6,0,0)));var mapped=ScheduleDocumentMapper.ToProjection(ScheduleDocumentMapper.ToDto(r.Document));Assert.Equal(e.Absences![0].Id,mapped.Employees[0].Absences![0].Id);var before=JsonSerializer.Serialize(r);_ = PureComposition.Analyze().Execute(r);Assert.Equal(before,JsonSerializer.Serialize(r));var planning=PlanningDocumentMapping.Open(r);Assert.Equal(e.Absences[0].Id,planning.ToDocument().Employees[0].Absences![0].Id);}
}
