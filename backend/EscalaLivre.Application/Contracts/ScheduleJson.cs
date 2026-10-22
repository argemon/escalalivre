using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Application.Contracts;

// Civil schedule timestamps are intentionally DateTimeKind.Unspecified.
// Only UpdatedAt is an instant (DateTimeOffset), always written in UTC.
public static class ScheduleJson
{
    public const string DefaultTimeZone = "America/Cuiaba";
    public static void Configure(JsonSerializerOptions options)
    {
        options.Converters.Add(new ScheduleDurationConverter());
        options.Converters.Add(new DocumentConverter());
        options.Converters.Add(new RequestConverter());
    }
    public static JsonSerializerOptions CreateOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web) { MaxDepth = 32, DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };
        Configure(options);
        return options;
    }
    public static bool ValidTimeZone(string? zone)
    {
        if (string.IsNullOrWhiteSpace(zone) || zone.Length > DocumentValidationLimits.TimeZone) return false;
        try { TimeZoneInfo.FindSystemTimeZoneById(zone); return true; }
        catch (TimeZoneNotFoundException) { return false; }
        catch (InvalidTimeZoneException) { return false; }
    }
    public static DateTime Civil(string text, string zone)
    {
        string[] civilFormats = ["yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd'T'HH:mm:ss.FFFFFFF"];
        if (DateTime.TryParseExact(text, civilFormats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var civil))
            return DateTime.SpecifyKind(civil.AddTicks(-(civil.Ticks % TimeSpan.TicksPerSecond)), DateTimeKind.Unspecified);
        string[] instantFormats = ["yyyy-MM-dd'T'HH:mm:ssK", "yyyy-MM-dd'T'HH:mm:ss.FFFFFFFK"];
        if (!DateTimeOffset.TryParseExact(text, instantFormats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var instant)
            || !(text.EndsWith('Z') || (text.Length >= 6 && text[^6] is '+' or '-')))
            throw new JsonException("Data e horário inválidos.");
        var local = TimeZoneInfo.ConvertTime(instant, TimeZoneInfo.FindSystemTimeZoneById(zone)).DateTime;
        return DateTime.SpecifyKind(local.AddTicks(-(local.Ticks % TimeSpan.TicksPerSecond)), DateTimeKind.Unspecified);
    }
    private static JsonSerializerOptions Plain(JsonSerializerOptions options)
    {
        var plain = new JsonSerializerOptions(options);
        for (int i = plain.Converters.Count - 1; i >= 0; i--)
            if (plain.Converters[i] is DocumentConverter or RequestConverter) plain.Converters.RemoveAt(i);
        return plain;
    }
    private static void NormalizeWindows(JsonNode? node, string zone)
    {
        if (node is JsonArray array) { foreach (var item in array) NormalizeWindows(item, zone); }
        else if (node is JsonObject obj)
        {
            foreach (var key in obj.Select(p => p.Key).ToArray())
            {
                if (key is "start" or "end" && obj[key] is JsonValue v && v.TryGetValue<string>(out var text) && text.Contains('T'))
                    obj[key] = Civil(text, zone).ToString("yyyy-MM-dd'T'HH:mm:ss", CultureInfo.InvariantCulture);
                else NormalizeWindows(obj[key], zone);
            }
        }
    }
    // Durations use total hours on the wire, including 24h shifts and multi-day rest.
    // Legacy TimeSpan day notation remains readable.
    private sealed class ScheduleDurationConverter : JsonConverter<TimeSpan>
    {
        public override TimeSpan Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options)
        {
            if (reader.TokenType != JsonTokenType.String) throw new JsonException("Duração inválida.");
            var match=System.Text.RegularExpressions.Regex.Match(reader.GetString()!, @"^(?:(\d+)\.)?(\d{2,3}):(\d{2}):(\d{2})$");
            if (!match.Success || !int.TryParse(match.Groups[1].Success ? match.Groups[1].Value : "0",out var days)
                || !int.TryParse(match.Groups[2].Value,out var hours) || !int.TryParse(match.Groups[3].Value,out var minutes)
                || !int.TryParse(match.Groups[4].Value,out var seconds) || minutes >= 60 || seconds >= 60
                || (match.Groups[1].Success && hours >= 24) || days > 7) throw new JsonException("Duração inválida.");
            return TimeSpan.FromSeconds((long)days*86400+(long)hours*3600+minutes*60+seconds);
        }
        public override void Write(Utf8JsonWriter writer, TimeSpan value, JsonSerializerOptions options)
            => writer.WriteStringValue($"{(long)value.TotalHours:00}:{value.Minutes:00}:{value.Seconds:00}");
    }
    private sealed class DocumentConverter : JsonConverter<EscalaLivreDocument>
    {
        public override EscalaLivreDocument? Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options)
        {
            var node = JsonNode.Parse(ref reader);
            if (node is null) return null;
            if (node is not JsonObject) throw new JsonException("Documento inválido.");
            if (node["company"] is not null && node["company"] is not JsonObject) throw new JsonException("Empresa inválida.");
            string zone = DefaultTimeZone;
            if (node["company"]?["timeZone"] is { } zoneNode)
            {
                if (zoneNode is not JsonValue zoneValue || !zoneValue.TryGetValue<string>(out var zoneText)) throw new JsonException("Fuso horário inválido.");
                zone = zoneText;
            }
            if (!ValidTimeZone(zone)) throw new JsonException("Fuso horário inválido.");
            NormalizeWindows(node, zone);
            string? updated = null;
            if (node["updatedAt"] is { } updatedNode)
            {
                if (updatedNode is not JsonValue updatedValue || !updatedValue.TryGetValue<string>(out updated)) throw new JsonException("Atualização inválida.");
            }
            if (updated is not null && !(updated.EndsWith('Z') || (updated.Length >= 6 && updated[^6] is '+' or '-')))
                throw new JsonException("A atualização deve informar um instante com fuso horário.");
            var document = node.Deserialize<EscalaLivreDocument>(Plain(options));
            return document is null ? null : document with { UpdatedAt = document.UpdatedAt.ToUniversalTime(), Company = document.Company is null ? null! : document.Company with { TimeZone = zone } };
        }
        public override void Write(Utf8JsonWriter writer, EscalaLivreDocument document, JsonSerializerOptions options)
        {
            var node = JsonSerializer.SerializeToNode(document with { UpdatedAt = document.UpdatedAt.ToUniversalTime() }, Plain(options))!;
            var zone = document.Company?.TimeZone ?? DefaultTimeZone;
            if (!ValidTimeZone(zone)) throw new JsonException("Fuso horário inválido.");
            NormalizeWindows(node, zone);
            node.WriteTo(writer);
        }
    }
    private sealed class RequestConverter : JsonConverter<ScheduleRequest>
    {
        public override ScheduleRequest? Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options)
        {
            using var json = JsonDocument.ParseValue(ref reader);
            var root = json.RootElement;
            if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("document", out var documentNode)
                || !root.TryGetProperty("start", out var startNode) || startNode.ValueKind != JsonValueKind.String
                || !root.TryGetProperty("end", out var endNode) || endNode.ValueKind != JsonValueKind.String)
                throw new JsonException("Requisição de planejamento incompleta.");
            var document = documentNode.Deserialize<EscalaLivreDocument>(options);
            var zone = document?.Company?.TimeZone ?? DefaultTimeZone;
            return new(document!, Civil(startNode.GetString()!,zone), Civil(endNode.GetString()!,zone));
        }
        public override void Write(Utf8JsonWriter writer, ScheduleRequest request, JsonSerializerOptions options)
        {
            writer.WriteStartObject();
            writer.WritePropertyName("document"); JsonSerializer.Serialize(writer,request.Document,options);
            writer.WriteString("start",Civil(request.Start.ToString("O",CultureInfo.InvariantCulture),request.Document.Company.TimeZone).ToString("yyyy-MM-dd'T'HH:mm:ss",CultureInfo.InvariantCulture));
            writer.WriteString("end",Civil(request.End.ToString("O",CultureInfo.InvariantCulture),request.Document.Company.TimeZone).ToString("yyyy-MM-dd'T'HH:mm:ss",CultureInfo.InvariantCulture));
            writer.WriteEndObject();
        }
    }
}
