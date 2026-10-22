using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Validation;
using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Infrastructure.ImportExport;

namespace EscalaLivre.Tests;

public sealed class DocumentValidationContractTests
{
    private static readonly JsonNode Fixtures=JsonNode.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"document-validation-scenarios.json")))!;
    public static IEnumerable<object[]> Scenarios() => Fixtures["scenarios"]!.AsArray().Select(s => new object[]{s!["id"]!.GetValue<string>()});

    private static JsonNode DocumentFor(JsonNode scenario)
    {
        var document=Fixtures["document"]!.DeepClone();
        foreach(var change in scenario["changes"]!.AsArray())
        {
            var keys=change!["path"]!.AsArray().Select(k=>k!.GetValue<string>()).ToArray();
            var parent=document;
            foreach(var key in keys[..^1])parent=parent is JsonArray array ? array[int.Parse(key)]! : parent[key]!;
            var last=keys[^1];
            JsonNode? value;
            if(change["repeat"] is { } count)
            {
                var source=(parent is JsonArray array ? array[int.Parse(last)] : parent[last])!.AsArray()[0]!;
                var values=new JsonArray();
                for(int i=0;i<count.GetValue<int>();i++)
                {
                    var item=source.DeepClone();
                    if(change["uniqueIds"]!.GetValue<bool>() && i>0)item["id"]=$"11111111-1111-4111-8111-{i:000000000000}";
                    values.Add(item);
                }
                value=values;
            }
            else value=change["value"]?.DeepClone();
            if(parent is JsonArray list)list[int.Parse(last)]=value;else parent[last]=value;
        }
        return document;
    }

    [Theory]
    [MemberData(nameof(Scenarios))]
    public void NativeImportAndGenerationShareFrontendAcceptance(string id)
    {
        var scenario=Fixtures["scenarios"]!.AsArray().Single(s=>s!["id"]!.GetValue<string>()==id)!;
        bool expected=scenario["accepted"]!.GetValue<bool>();
        var raw=DocumentFor(scenario).ToJsonString();
        EscalaLivreDocument? document=null;string? error;
        try {document=JsonSerializer.Deserialize<EscalaLivreDocument>(raw,ScheduleJson.CreateOptions());error=DocumentSafety.Error(document);}
        catch(JsonException exception){error=exception.Message;}
        Assert.True((error is null)==expected,$"{id}: {error ?? "accepted unexpectedly"}");
        if(document is not null)
        {
            var period=document.PlanningPeriod!;
            var request=new ScheduleRequest(document,period.Start.ToDateTime(TimeOnly.MinValue),period.End.ToDateTime(new TimeOnly(23,59,59)));
            Assert.Equal(expected,new ScheduleRequestValidator().Validate(request).IsValid);
        }
        var bytes=Encoding.UTF8.GetBytes(raw);
        if(bytes.Length<=NativeDocumentLimits.MaxBytes)
        {
            var failure=Record.Exception(()=>new NativeScheduleSerializer().Import(new("contract.escalalivre",Convert.ToBase64String(bytes),"native")));
            Assert.True((failure is null)==expected,$"{id}: native import: {failure?.Message}");
        }
    }
}
