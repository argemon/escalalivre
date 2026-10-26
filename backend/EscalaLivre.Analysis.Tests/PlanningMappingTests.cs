using System.Text.Json;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Contracts.Documents;
using EscalaLivre.Application.Planning;
using EscalaLivre.Application.Scheduling;
using EscalaLivre.Application.Validation;
using EscalaLivre.Domain.Planning;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Analysis.Tests;

public sealed class PlanningMappingTests
{
    private static readonly JsonSerializerOptions Plain = new(JsonSerializerDefaults.Web);
    public static IEnumerable<object[]> Scenarios() => AnalysisContractTests.Scenarios();

    [Theory]
    [MemberData(nameof(Scenarios))]
    public void DtosRoundTripEveryFieldAndAcceptedConflictsRemainMappable(string id)
    {
        // Read without the new document converter: this is the old public record shape.
        using var fixtures = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "rule-scenarios.json")));
        var raw = fixtures.RootElement.GetProperty("scenarios").EnumerateArray().Single(s => s.GetProperty("id").GetString() == id).GetProperty("request");
        var before = raw.GetProperty("document").Deserialize<EscalaLivreDocument>(Plain)!;
        var dto = ScheduleDocumentMapper.ToDto(before);
        var after = ScheduleDocumentMapper.ToProjection(dto);
        Assert.Equal(JsonSerializer.Serialize(before, Plain), JsonSerializer.Serialize(after, Plain));
        Assert.Equal("planningPeriod", JsonNamingPolicy.CamelCase.ConvertName(nameof(EscalaLivreDocumentDto.PlanningPeriod)));
        var request = new ScheduleRequest(after, DateTime.Parse(raw.GetProperty("start").GetString()!), DateTime.Parse(raw.GetProperty("end").GetString()!));
        if (DocumentSafety.Error(after) is not null)
        {
            Assert.Throws<FormatException>(() => PlanningDocumentMapping.Open(request));
            return; // Legacy diagnostic projections can still represent rejected structural input.
        }
        var mapping = PlanningDocumentMapping.Open(request);
        var restored = mapping.ToDocument();
        Assert.Equal(JsonSerializer.Serialize(before, Plain), JsonSerializer.Serialize(restored, Plain));
        var analyzer = new ScheduleAnalyzer(new ScheduleEvaluator());
        Assert.Equal(JsonSerializer.Serialize(analyzer.Analyze(request), Plain),
            JsonSerializer.Serialize(analyzer.Analyze(request with { Document = restored }), Plain));
    }

    [Fact]
    public void ProjectionAndAggregateExportsDoNotShareMutableInputCollections()
    {
        var request = AnalysisContractTests.Request(); var original = request.Document.Assignments.Single();
        var tags = new List<string> { "original" }; var roles = new List<DocumentRole> { new(Guid.NewGuid(), "A") };
        var coverage = request.Document.Company.Coverage.ToList();
        var availability = request.Document.Employees[0].Availability.ToList();
        var person = request.Document.Employees[0] with { Availability = availability };
        request = request with { Document = request.Document with { Roles = roles, Company = request.Document.Company with { Coverage = coverage },
            Employees = [person], Assignments = [original with { Tags = tags }] } };
        var mapping = PlanningDocumentMapping.Open(request);
        var dto = ScheduleDocumentMapper.ToDto(request.Document);
        tags[0] = "external"; roles.Clear(); coverage.Clear(); availability.Clear();
        var restored = mapping.ToDocument();
        Assert.Equal("original", restored.Assignments[0].Tags.Single());
        Assert.Equal("original", dto.Assignments[0].Tags.Single());
        Assert.Single(restored.Roles!);
        Assert.NotEmpty(restored.Company.Coverage);
        Assert.NotEmpty(restored.Employees[0].Availability);
        Assert.Throws<NotSupportedException>(() => ((IList<string>)restored.Assignments[0].Tags).Clear());
        Assert.Throws<NotSupportedException>(() => ((IList<CoverageRequirement>)restored.Company.Coverage).Clear());
        Assert.Throws<NotSupportedException>(() => ((IList<AvailabilityWindow>)restored.Employees[0].Availability).Clear());
        Assert.Throws<NotSupportedException>(() => ((IList<ShiftAssignmentDto>)dto.Assignments).Clear());
    }

    [Fact]
    public void SettingsProtectAllNestedCollectionsAndKeepUnitsTyped()
    {
        var document = AnalysisContractTests.Request().Document;
        var restrictions = new List<AvailabilityWindow> { new(new(2026,10,18), new(2026,10,18,1,0,0)) };
        var preferences = new List<Preference> { new("closing", 10, "") };
        var daysOff = new List<DayOfWeek> { DayOfWeek.Sunday };
        var working = new List<DayOfWeek> { DayOfWeek.Monday };
        var names = new List<string> { "B" }; var ids = new List<Guid> { Guid.NewGuid() };
        var days = document.Company.OperatingDays.ToList(); var holidays = new List<Holiday> { new(new(2026,10,20), "Holiday") };
        var employee = document.Employees[0] with { Restrictions = restrictions, Preferences = preferences, PreferredDaysOff = daysOff,
            WorkingDays = working, CoverageRoles = names, CoverageRoleIds = ids };
        var settings = new PlanningSettings(document.Company with { OperatingDays = days, Holidays = holidays }, [employee]);
        restrictions.Clear(); preferences.Clear(); daysOff.Clear(); working.Clear(); names.Clear(); ids.Clear(); days.Clear(); holidays.Clear();
        var frozen = settings.Employees[0];
        Assert.Single(frozen.Restrictions); Assert.Single(frozen.Preferences); Assert.Single(frozen.PreferredDaysOff); Assert.Single(frozen.WorkingDays!);
        Assert.Single(frozen.CoverageRoles!); Assert.Single(frozen.CoverageRoleIds!); Assert.NotEmpty(settings.Company.OperatingDays); Assert.Single(settings.Company.Holidays!);
        Assert.Throws<NotSupportedException>(() => ((IList<Preference>)frozen.Preferences).Clear());
        Assert.Throws<NotSupportedException>(() => ((IList<DayOfWeek>)frozen.WorkingDays!).Clear());
        Assert.Throws<NotSupportedException>(() => ((IList<string>)frozen.CoverageRoles!).Clear());
        Assert.Throws<NotSupportedException>(() => ((IDictionary<Guid, RegimeConfiguration>)settings.EmployeeRegimes).Clear());
        Assert.IsType<DayCycleConfiguration>(settings.DefaultRegime);
        Assert.Throws<ArgumentException>(() => settings.WithEmployee(employee.Id, employee with { Id = Guid.NewGuid() }));
        Assert.Throws<ArgumentException>(() => new PlanningSettings(document.Company with { Lunch = new(TimeSpan.FromHours(2), TimeSpan.FromHours(1), TimeSpan.Zero) }, [employee]));
    }

    [Fact]
    public void PublicCollectionSynchronizationCannotExposeMutableDomainStorage()
    {
        static void AttemptMutation<T>(IReadOnlyList<T> values, T replacement)
        {
            if (values is not System.Collections.ICollection collection) return;
            try
            {
                if (collection.SyncRoot is Array storage && storage.Length > 0) storage.SetValue(replacement, 0);
            }
            catch (NotSupportedException) { }
        }
        var request = AnalysisContractTests.Request();
        var mapping = PlanningDocumentMapping.Open(request);
        var original = mapping.Schedule.Assignments[0];
        // Use nonempty tags to exercise the exposed-array attack, in addition to IList mutation tests.
        var tagged = mapping.ImportAssignment(request.Document.Assignments[0] with { Tags = ["original"] });
        AttemptMutation(tagged.Tags, "external");
        AttemptMutation(mapping.Settings.Employees, request.Document.Employees[0] with { Id = Guid.NewGuid() });
        AttemptMutation(mapping.Settings.Company.OperatingDays, (DayOfWeek)99);
        Assert.Equal("original", tagged.Tags.Single());
        Assert.Equal(request.Document.Employees[0].Id, mapping.Settings.Employees[0].Id);
        Assert.Equal(request.Document.Company.OperatingDays, mapping.Settings.Company.OperatingDays);
        Assert.Same(original, mapping.Schedule.Assignments[0]);
    }

    [Fact]
    public void OptionalIdentityCatalogAndSetupFieldsSurviveBothMappingBoundaries()
    {
        var request = AnalysisContractTests.Request();
        var primary = Guid.NewGuid(); var substitute = Guid.NewGuid();
        var employee = request.Document.Employees[0] with { RoleId = primary, CoverageRoleIds = [substitute], CoverageRoles = ["Substitute"],
            WorkingDays = [DayOfWeek.Monday], ShiftStartsAt = new(8,0,1), FixedInterval = new(new(12,0), new(13,0)) };
        var company = request.Document.Company with { MiddayClosure = new(new(12,0), new(13,0)), Holidays = [],
            Coverage = request.Document.Company.Coverage.Select(c => c with { RoleId = substitute }).ToArray() };
        request = request with { Document = request.Document with { Company = company, Employees = [employee], Setup = new(true),
            Roles = [new(primary, employee.Role), new(substitute, "Substitute")],
            Assignments = request.Document.Assignments.Select(a => a with { RoleId = primary }).ToArray() } };
        var projected = ScheduleDocumentMapper.ToProjection(ScheduleDocumentMapper.ToDto(request.Document));
        var restored = PlanningDocumentMapping.Open(request with { Document = projected }).ToDocument();
        Assert.Equal(JsonSerializer.Serialize(request.Document, Plain), JsonSerializer.Serialize(restored, Plain));
        Assert.True(restored.Setup!.CompanyConfigured);
        Assert.Equal(substitute, restored.Employees[0].CoverageRoleIds!.Single());
        Assert.NotNull(restored.Company.Holidays);
        Assert.Empty(restored.Company.Holidays);
    }

    [Fact]
    public void SuccessfulGenerationMustRespectHistoryAndAcceptEquivalentCopies()
    {
        var request = AnalysisContractTests.Request(); var selected = request.Document.Assignments.Single();
        var history = selected with { Id = Guid.NewGuid(), Start = selected.Start.AddDays(-7), End = selected.End.AddDays(-7), Break = null };
        request = request with { Document = request.Document with { Assignments = [history] } };
        ShiftAssignment[] complete = [history, selected with { Tags = selected.Tags.ToArray() }];
        Assert.Same(complete, PlanningDocumentMapping.ApplyGeneration(request, [selected], complete));
        Assert.Throws<InvalidOperationException>(() => PlanningDocumentMapping.ApplyGeneration(request, [selected], [selected]));
        Assert.Throws<InvalidOperationException>(() => PlanningDocumentMapping.ApplyGeneration(request, [selected], [history with { End = history.End.AddSeconds(1) }, selected]));
        Assert.Same(history, Assert.Single(request.Document.Assignments));
        var withPause = history with { Break = new(history.Start.AddHours(4), history.Start.AddHours(5)) };
        var qualifiedPause = withPause with { Break = new(DateTime.SpecifyKind(withPause.Break!.Start, DateTimeKind.Utc), DateTime.SpecifyKind(withPause.Break.End, DateTimeKind.Utc)) };
        var pausedRequest = request with { Document = request.Document with { Assignments = [withPause] } };
        Assert.Throws<InvalidOperationException>(() => PlanningDocumentMapping.ApplyGeneration(pausedRequest, [selected], [qualifiedPause, selected]));
    }
}
