using System.Text;
using System.Text.Json;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Infrastructure.ImportExport;

namespace EscalaLivre.Adapter.Tests;
public sealed class RecoveryContractTests
{
    private static EscalaLivreDocument Document(int shifts=0)
    {
        var rule=new WorkloadRule("dayBased",7,0,44,TimeSpan.FromHours(4));
        var person=new Employee(Guid.NewGuid(),"Pessoa","Equipe",true,rule,[],[],[],false,true,[]);
        var company=new CompanyRules("Ação · 日本語 · 😀",new(8,0),new(18,0),[DayOfWeek.Monday],rule,
            new(TimeSpan.Zero,TimeSpan.Zero,TimeSpan.FromHours(2)),TimeSpan.FromHours(11),[]);
        var assignments=Enumerable.Range(0,shifts).Select(i=>new ShiftAssignment(Guid.NewGuid(),person.Id,person.Role,
            new DateTime(2026,1,1,8,0,0).AddDays(i),new DateTime(2026,1,1,12,0,0).AddDays(i),null,"manual",Enumerable.Repeat(new string('a',256),50).ToArray())).ToArray();
        return new("1.0.0",Guid.NewGuid(),company,[person],assignments,DateTimeOffset.UtcNow,new(new(2026,10,19),new(2026,10,19)));
    }
    [Fact]
    public void EverySuccessfulNativeExportCanBeImportedIncludingUtf8Text()
    {
        var serializer=new NativeScheduleSerializer();var document=Document(30);
        var exported=serializer.Export(new(document,"native"));
        Assert.True(Convert.FromBase64String(exported.ContentBase64).Length<=NativeDocumentLimits.MaxBytes);
        var imported=serializer.Import(new(exported.FileName,exported.ContentBase64,"native"));
        Assert.Equal(document.Company.Name,imported.Company.Name);Assert.Equal(document.Assignments.Count,imported.Assignments.Count);
    }
    [Fact]
    public void NativeExportRejectsAnOversizedDocumentInsteadOfProducingAnUnimportableFile()
        => Assert.Throws<FormatException>(()=>new NativeScheduleSerializer().Export(new(Document(100),"native")));
    [Fact]
    public void ExactByteBoundaryIsAcceptedAndOneMoreByteIsRejected()
    {
        var serializer=new NativeScheduleSerializer();var exported=serializer.Export(new(Document(),"native"));
        var bytes=Convert.FromBase64String(exported.ContentBase64);
        var exact=bytes.Concat(Enumerable.Repeat((byte)' ',NativeDocumentLimits.MaxBytes-bytes.Length)).ToArray();
        Assert.NotNull(serializer.Import(new("exact.escalalivre",Convert.ToBase64String(exact),"native")));
        Assert.Throws<FormatException>(()=>serializer.Import(new("too-big.escalalivre",Convert.ToBase64String(exact.Append((byte)' ').ToArray()),"native")));
    }
}
