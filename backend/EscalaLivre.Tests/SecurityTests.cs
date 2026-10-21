using System.Text;
using System.Text.Json;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Validation;
using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Infrastructure.ImportExport;
using EscalaLivre.Infrastructure.Solver;

namespace EscalaLivre.Tests;

public sealed class SecurityTests
{
    private static ScheduleRequest Request()
    {
        var rule = new WorkloadRule("dayBased", 5, 2, 44, TimeSpan.FromHours(8));
        var company = new CompanyRules("Loja", new(8, 0), new(18, 0), [DayOfWeek.Monday], rule,
            new(TimeSpan.FromHours(1), TimeSpan.FromHours(1), TimeSpan.FromHours(4)), TimeSpan.FromHours(11),
            [new("Atendimento", DayOfWeek.Monday, new(8, 0), new(18, 0), 1)]);
        var person = new Employee(Guid.NewGuid(), "Pessoa", "Atendimento", true, rule, [], [], [], false, false, []);
        return new(new("1.0.0", Guid.NewGuid(), company, [person], [], DateTimeOffset.UtcNow), new(2026, 10, 19), new(2026, 10, 19, 23, 59, 59));
    }

    [Fact]
    public void ValidDocumentStillRoundTrips()
    {
        var serializer = new NativeScheduleSerializer();
        var document = Request().Document;
        var exported = serializer.Export(new(document, "native"));
        Assert.Equal(document.Id, serializer.Import(new(exported.FileName, exported.ContentBase64, "native")).Id);
        Assert.True(new ScheduleRequestValidator().Validate(Request()).IsValid);
    }

    [Fact]
    public void MissingNestedObjectsReturnValidationErrors()
    {
        var request = Request();
        Assert.False(new ScheduleRequestValidator().Validate(request with { Document = null! }).IsValid);
        Assert.NotNull(DocumentSafety.Error(request.Document with { Company = null! }));
        Assert.NotNull(DocumentSafety.Error(request.Document with { Employees = [null!] }));
        Assert.NotNull(DocumentSafety.Error(request.Document with { Employees = [request.Document.Employees[0] with { Workload = null! }] }));
    }

    [Fact]
    public void OversizedCollectionsAndStringsAreRejected()
    {
        var doc = Request().Document;
        Assert.NotNull(DocumentSafety.Error(doc with { Company = doc.Company with { Coverage = Enumerable.Repeat(doc.Company.Coverage[0], 1001).ToArray() } }));
        Assert.NotNull(DocumentSafety.Error(doc with { Employees = [doc.Employees[0] with { Name = new string('x', 257) }] }));
        Assert.NotNull(DocumentSafety.Error(doc with { Employees = [doc.Employees[0] with { Preferences = Enumerable.Repeat(new Preference("x", 1, ""), 51).ToArray() }] }));
    }

    [Fact]
    public void OverflowingCyclesAndInvalidIntervalsAreRejected()
    {
        var doc = Request().Document;
        Assert.NotNull(DocumentSafety.Error(doc with { Company = doc.Company with { DefaultWorkload = doc.Company.DefaultWorkload with { WorkUnits = int.MaxValue } } }));
        Assert.NotNull(DocumentSafety.Error(doc with { Company = doc.Company with { Lunch = new(TimeSpan.Zero, TimeSpan.MaxValue, TimeSpan.Zero) } }));
    }

    [Fact]
    public void DuplicateEmployeesAndUnknownAssignmentOwnersAreRejected()
    {
        var doc = Request().Document;
        Assert.NotNull(DocumentSafety.Error(doc with { Employees = [doc.Employees[0], doc.Employees[0]] }));
        Assert.NotNull(DocumentSafety.Error(doc with { Assignments = [new(Guid.NewGuid(), Guid.NewGuid(), "x", new(2026, 10, 19, 8, 0, 0), new(2026, 10, 19, 16, 0, 0), null, "manual", [])] }));
    }

    [Fact]
    public void DatesCannotOverflowAndPartialThirtySecondDayIsRejected()
    {
        var validator = new ScheduleRequestValidator();
        var request = Request();
        Assert.False(validator.Validate(request with { End = DateTime.MaxValue }).IsValid);
        Assert.False(validator.Validate(request with { Start = request.Start.AddHours(1), End = request.Start.AddDays(31) }).IsValid);
        Assert.True(validator.Validate(request with { End = request.Start.AddDays(31).AddTicks(-1) }).IsValid);
    }

    [Theory]
    [InlineData("not base64")]
    [InlineData("bnVsbA==")]
    [InlineData("e30=")]
    public void InvalidImportedDocumentsAreRejected(string content)
        => Assert.Throws<FormatException>(() => new NativeScheduleSerializer().Import(new("x.escalalivre", content, "native")));

    [Fact]
    public void LargeDecodedFileIsRejected()
        => Assert.Throws<FormatException>(() => new NativeScheduleSerializer().Import(new("x.escalalivre", Convert.ToBase64String(new byte[1024 * 1024 + 1]), "native")));

    [Fact]
    public void ImportedInvalidGraphIsRejected()
    {
        var document = Request().Document with { Company = null! };
        var json = JsonSerializer.Serialize(document, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.Throws<FormatException>(() => new NativeScheduleSerializer().Import(new("x.escalalivre", Convert.ToBase64String(Encoding.UTF8.GetBytes(json)), "native")));
    }

    [Fact]
    public void ExcessiveCandidateSearchStopsBeforeBuildingTheModel()
    {
        var request = Request();
        request = request with { End = request.Start.AddDays(6), Document = request.Document with {
            Employees = Enumerable.Range(0, 200).Select(_ => request.Document.Employees[0] with { Id = Guid.NewGuid() }).ToArray(),
            Company = request.Document.Company with { OperatingDays = Enum.GetValues<DayOfWeek>(), Lunch = new(TimeSpan.FromHours(1), TimeSpan.FromHours(2), TimeSpan.FromHours(4)) }
        } };
        Assert.Throws<ScheduleComplexityException>(() => new OrToolsScheduleSolver().Solve(request));
    }
}
