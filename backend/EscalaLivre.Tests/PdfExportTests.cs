using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Infrastructure.ImportExport;
using PdfSharp.Pdf.IO;
using PdfSharp.Pdf;

namespace EscalaLivre.Tests;

public sealed class PdfExportTests
{
    private static EscalaLivreDocument Document(int shifts,bool longText=false)
    {
        var rule=new WorkloadRule("dayBased",5,2,44,TimeSpan.FromHours(8));
        var employee=new Employee(Guid.NewGuid(),longText?new string('W',256):"João Gonçalves (Equipe \\ A)",longText?new string('M',256):"Recepção",true,rule,[],[],[],false,false,[]);
        var company=new CompanyRules("Organização São José",new(8,0),new(18,0),[DayOfWeek.Monday],rule,
            new(TimeSpan.FromHours(1),TimeSpan.FromHours(2),TimeSpan.FromHours(4)),TimeSpan.FromHours(11),[]);
        var assignments=Enumerable.Range(0,shifts).Select(i=>new ShiftAssignment(Guid.NewGuid(),employee.Id,employee.Role,
            new DateTime(2026,10,1,22,0,0).AddDays(i),new DateTime(2026,10,2,6,0,0).AddDays(i),
            new(new DateTime(2026,10,2,2,0,0).AddDays(i),new DateTime(2026,10,2,3,0,0).AddDays(i)),"manual",[])).ToArray();
        return new("1.0.0",Guid.NewGuid(),company,[employee],assignments,DateTimeOffset.UtcNow,new(new(2026,10,1),new(2026,10,31)));
    }
    [Theory]
    [InlineData(0,false)]
    [InlineData(1,false)]
    [InlineData(120,false)]
    [InlineData(12,true)]
    public void ExportIsReadablePaginatedAndHasEmbeddedFonts(int count,bool longText)
    {
        var result=new NativeScheduleSerializer().Export(new(Document(count,longText),"pdf"));
        Assert.Equal("application/pdf",result.MimeType);
        using var stream=new MemoryStream(Convert.FromBase64String(result.ContentBase64));
        using var pdf=PdfReader.Open(stream,PdfDocumentOpenMode.Import);
        Assert.Equal("Escala da equipe - Organização São José",pdf.Info.Title);
        Assert.Equal(count>1,pdf.PageCount>1);
        // Full embedded font bytes prevent loss of nested composite accents during subsetting.
        var assembly=typeof(NativeScheduleSerializer).Assembly;
        var expectedFonts=new[]{"NotoSans-Regular.ttf","NotoSans-Bold.ttf"}.Select(name=>{
            using var resource=assembly.GetManifestResourceStream("EscalaLivre.Fonts."+name)!;
            using var bytes=new MemoryStream();resource.CopyTo(bytes);return bytes.ToArray();
        }).ToArray();
        var descriptors=pdf.Internals.GetAllObjects().OfType<PdfDictionary>().Where(d=>d.Elements.ContainsKey("/FontFile2")).ToList();
        Assert.NotEmpty(descriptors);
        foreach(var descriptor in descriptors)
            Assert.Contains(expectedFonts,font=>font.SequenceEqual(descriptor.Elements.GetDictionary("/FontFile2")!.Stream.UnfilteredValue));
        foreach(var page in pdf.Pages)
        {
            Assert.True(page.Width.Point>page.Height.Point);Assert.True(page.Contents.Elements.Count>0);
            var fonts=page.Resources.Elements.GetDictionary("/Font");Assert.NotNull(fonts);Assert.True(fonts.Elements.Count>0);
        }
    }
}
