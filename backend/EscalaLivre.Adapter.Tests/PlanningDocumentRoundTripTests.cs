using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Planning;
using EscalaLivre.Application.Scheduling;
using EscalaLivre.Application.Validation;
using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Infrastructure.ImportExport;

namespace EscalaLivre.Adapter.Tests;

public sealed class PlanningDocumentRoundTripTests
{
    private static ScheduleRequest Request(string id)
    {
        using var json = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "rule-scenarios.json")));
        return json.RootElement.GetProperty("scenarios").EnumerateArray().Single(s => s.GetProperty("id").GetString() == id)
            .GetProperty("request").Deserialize<ScheduleRequest>(ScheduleJson.CreateOptions())!;
    }

    [Theory]
    [InlineData("fixed-break-overnight")]
    [InlineData("break-at-shift-start")]
    [InlineData("break-at-shift-end")]
    [InlineData("hour-regime-excludes-break")]
    [InlineData("minimum-rest-previous-side")]
    [InlineData("day-cycle-across-both-borders")]
    [InlineData("role-mismatch-is-not-normalized-away")]
    public void CurrentDocumentsKeepIdentityTimesOptionalFieldsAndConflicts(string id)
    {
        var request = Request(id);
        var options = ScheduleJson.CreateOptions();
        var serializer = new NativeScheduleSerializer();
        var mapped = PlanningDocumentMapping.Open(request).ToDocument();
        var exported = serializer.Export(new(mapped, "native"));
        var imported = serializer.Import(new(exported.FileName, exported.ContentBase64, "native"));
        Assert.Null(DocumentSafety.Error(imported));
        Assert.Equal(JsonSerializer.Serialize(request.Document, options), JsonSerializer.Serialize(imported, options));
        var analyzer = new ScheduleAnalyzer(new ScheduleEvaluator());
        Assert.Equal(JsonSerializer.Serialize(analyzer.Analyze(request), options),
            JsonSerializer.Serialize(analyzer.Analyze(request with { Document = imported }), options));
        var native = JsonNode.Parse(Encoding.UTF8.GetString(Convert.FromBase64String(exported.ContentBase64)))!;
        Assert.Equal("1.0.0", native["schemaVersion"]!.GetValue<string>());
        Assert.NotNull(native["planningPeriod"]);
        Assert.Null(native["schedule"]);
        Assert.Null(native["settings"]);
        Assert.Null(native["company"]!["defaultWorkload"]!["workDays"]);
    }

    [Fact]
    public void LegacyQualifiedTimesAndMissingPeriodMigrateOnceBeforeInternalMapping()
    {
        var request = Request("minimum-rest-previous-side");
        var options = ScheduleJson.CreateOptions();
        var node = JsonNode.Parse(JsonSerializer.Serialize(request.Document, options))!;
        node.AsObject().Remove("planningPeriod");
        node["company"]!.AsObject().Remove("timeZone");
        // Both describe the same instant/civil company clock; precision is normalized by the existing converter.
        node["assignments"]![0]!["start"] = "2026-10-19T12:00:00.999Z";
        node["assignments"]![0]!["end"] = "2026-10-19T17:00:00-04:00";
        node["assignments"]![0]!["break"] = null;
        var serializer = new NativeScheduleSerializer();
        var first = serializer.Import(new("legacy.escalalivre", Convert.ToBase64String(Encoding.UTF8.GetBytes(node.ToJsonString())), "native"));
        Assert.Equal(new DateTime(2026,10,19,8,0,0), first.Assignments[0].Start);
        Assert.Equal(DateTimeKind.Unspecified, first.Assignments[0].Start.Kind);
        Assert.Equal(new DateTime(2026,10,19,17,0,0), first.Assignments[0].End);
        Assert.Equal("America/Cuiaba", first.Company.TimeZone);
        var period = first.PlanningPeriod!;
        var context = new ScheduleRequest(first, period.Start.ToDateTime(TimeOnly.MinValue), period.End.ToDateTime(new(23,59,59)));
        var internalRoundTrip = PlanningDocumentMapping.Open(context).ToDocument();
        var exported = serializer.Export(new(internalRoundTrip, "native"));
        var second = serializer.Import(new(exported.FileName, exported.ContentBase64, "native"));
        var exportedAgain = serializer.Export(new(second, "native"));
        var third = serializer.Import(new(exportedAgain.FileName, exportedAgain.ContentBase64, "native"));
        Assert.Equal(JsonSerializer.Serialize(first, options), JsonSerializer.Serialize(second, options));
        Assert.Equal(JsonSerializer.Serialize(second, options), JsonSerializer.Serialize(third, options));
        Assert.Equal(request.Document.Id, third.Id);
        Assert.Equal(request.Document.Assignments.Select(a => a.Id), third.Assignments.Select(a => a.Id));
        var analysis = new ScheduleAnalyzer(new ScheduleEvaluator()).Analyze(context with { Document = third });
        Assert.Contains(analysis.Conflicts, c => c.Code == "interval");
    }
}
