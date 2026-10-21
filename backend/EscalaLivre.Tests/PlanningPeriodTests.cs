using System.Text;
using System.Text.Json;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Validation;
using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Infrastructure.ImportExport;

namespace EscalaLivre.Tests;

public sealed class PlanningPeriodTests
{
    private static EscalaLivreDocument Document()
    {
        var rule = new WorkloadRule("dayBased", 5, 2, 44, TimeSpan.FromHours(8));
        var company = new CompanyRules("Loja", new(8,0), new(18,0), [DayOfWeek.Monday], rule,
            new(TimeSpan.FromHours(1), TimeSpan.FromHours(1), TimeSpan.FromHours(4)), TimeSpan.FromHours(11), []);
        return new("1.0.0", Guid.NewGuid(), company, [], [], DateTimeOffset.UtcNow);
    }

    [Fact]
    public void NativeRoundTripPreservesExplicitPeriod()
    {
        var serializer = new NativeScheduleSerializer();
        var document = Document() with { PlanningPeriod = new(new(2026,10,1), new(2026,10,31)) };
        var exported = serializer.Export(new(document,"native"));
        Assert.Equal(document.PlanningPeriod, serializer.Import(new(exported.FileName,exported.ContentBase64,"native")).PlanningPeriod);
    }

    [Fact]
    public void LegacyImportMigratesWithoutAssignments()
    {
        var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(Document(), new JsonSerializerOptions(JsonSerializerDefaults.Web)));
        var migrated = new NativeScheduleSerializer().Import(new("legacy.escalalivre",Convert.ToBase64String(bytes),"native"));
        Assert.Equal(DateOnly.FromDateTime(DateTime.Today), migrated.PlanningPeriod!.Start);
        Assert.Equal(migrated.PlanningPeriod.Start.AddDays(6), migrated.PlanningPeriod.End);
    }

    [Fact]
    public void SchedulingRejectsADifferentPeriodAndAllowsASingleDay()
    {
        var doc = Document() with { PlanningPeriod = new(new(2026,10,19),new(2026,10,19)) };
        var request = new ScheduleRequest(doc, new(2026,10,19), new(2026,10,19,23,59,59));
        var validator = new ScheduleRequestValidator();
        Assert.True(validator.Validate(request).IsValid);
        Assert.False(validator.Validate(request with { End = request.End.AddDays(1) }).IsValid);
        Assert.NotNull(DocumentSafety.Error(doc with { PlanningPeriod = new(new(2026,10,1),new(2026,11,1)) }));
        Assert.NotNull(DocumentSafety.Error(doc with { PlanningPeriod = new(new(2026,10,2),new(2026,10,1)) }));
    }
}
