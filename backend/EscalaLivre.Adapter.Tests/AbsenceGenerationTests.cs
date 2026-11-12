using System.Text.Json;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Infrastructure.ImportExport;
namespace EscalaLivre.Adapter.Tests;
public sealed class AbsenceGenerationTests {
 [Fact]public void GenerationCannotAllocateIntoAbsenceAndNativeRoundtripKeepsEvents(){using var j=JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"absence-scenarios.json")));var r=j.RootElement.GetProperty("scenarios")[0].GetProperty("request").Deserialize<ScheduleRequest>(ScheduleJson.CreateOptions())!;r=r with{Document=r.Document with{Assignments=[]}};var result=AdapterComposition.Generate().Execute(r);Assert.Equal("infeasible",result.Optimization!.Status);Assert.Contains(result.Conflicts,c=>c.Code=="solverInfeasible");Assert.Empty(result.Assignments);var native=new NativeScheduleSerializer();var file=native.Export(new(r.Document,"native"));var round=native.Import(new("absence.escalalivre",file.ContentBase64,"native"));Assert.Equal(r.Document.Employees[0].Absences,round.Employees[0].Absences);}
}
