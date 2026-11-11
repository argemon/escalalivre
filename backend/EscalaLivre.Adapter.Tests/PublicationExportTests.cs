using System.IO.Compression;
using System.Text;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Infrastructure.ImportExport;
using PdfSharp.Pdf.IO;
namespace EscalaLivre.Adapter.Tests;
public sealed class PublicationExportTests {
 [Fact]public void PublicExportsHaveVersionAndSafeTextWithoutInternalSource(){var rule=new WorkloadRule("dayBased",5,2,44,TimeSpan.FromHours(8));var e=new Employee(Guid.NewGuid(),"=HYPERLINK(private)","Recepção",true,rule,[],[],[],false,false,[]);var company=new CompanyRules("Loja de teste",new(8,0),new(18,0),[DayOfWeek.Monday],rule,new(TimeSpan.Zero,TimeSpan.FromHours(2),TimeSpan.FromHours(4)),TimeSpan.FromHours(11),[]);var s=new ShiftAssignment(Guid.NewGuid(),e.Id,e.Role,new(2026,11,4,22,0,1),new(2026,11,5,6,0,2),new(new(2026,11,5,2,0,3),new(2026,11,5,3,0,4)),"manual",["PRIVATE"]);var d=new EscalaLivreDocument("1.0.0",Guid.NewGuid(),company,[e],[s],DateTimeOffset.UtcNow,new(new(2026,11,4),new(2026,11,4)));var serializer=new NativeScheduleSerializer();var xlsx=serializer.Export(new(d,"xlsx","Versão 2 · 2026-11-11T12:00:00.000Z"));using var archive=new ZipArchive(new MemoryStream(Convert.FromBase64String(xlsx.ContentBase64)));using var reader=new StreamReader(archive.GetEntry("xl/worksheets/sheet1.xml")!.Open());var xml=reader.ReadToEnd();Assert.Contains("Versão 2",xml);Assert.Contains("=HYPERLINK(private)",xml);Assert.DoesNotContain("<f",xml);Assert.DoesNotContain("PRIVATE",xml);Assert.DoesNotContain("Origem",xml);Assert.DoesNotContain("America/",xml);Assert.DoesNotContain("Horários civis:",xml);Assert.Contains("22:00:01",xml);var pdf=serializer.Export(new(d,"pdf","RASCUNHO"));using var result=PdfReader.Open(new MemoryStream(Convert.FromBase64String(pdf.ContentBase64)),PdfDocumentOpenMode.Import);Assert.True(result.PageCount>=1);}
}
