using System.Text;
using EscalaLivre.Application.Validation;
using System.Text.Json;
using System.IO.Compression;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Infrastructure.ImportExport;

public sealed class NativeScheduleSerializer
{
    private static readonly JsonSerializerOptions JsonOptions = CreateJsonOptions();
    private static JsonSerializerOptions CreateJsonOptions()
    {
        var options = ScheduleJson.CreateOptions(); options.WriteIndented = true; return options;
    }

    public ExportResult Export(ExportRequest request)
    {
        if (request is null || DocumentSafety.Error(request.Document) is not null) throw new FormatException("Documento inválido.");
        if (request.Format is null) throw new FormatException("Formato inválido.");
        string json = JsonSerializer.Serialize(WithPlanningPeriod(request.Document), JsonOptions);
        if (request.Format.ToLowerInvariant() is "native" or "escalalivre")
        {
            byte[] native=Encoding.UTF8.GetBytes(json);
            if(native.Length>NativeDocumentLimits.MaxBytes)
            {
                var compactOptions=new JsonSerializerOptions(JsonOptions) { WriteIndented=false };
                native=JsonSerializer.SerializeToUtf8Bytes(WithPlanningPeriod(request.Document),compactOptions);
            }
            if(native.Length>NativeDocumentLimits.MaxBytes) throw new FormatException("Arquivo nativo maior que 1 MiB.");
            // Check the exact exported bytes with the import validator, including migrations.
            var roundTrip=JsonSerializer.Deserialize<EscalaLivreDocument>(native,JsonOptions);
            if(DocumentSafety.Error(roundTrip) is not null) throw new FormatException("Documento exportado inválido.");
            return new ExportResult("escala.escalalivre",Convert.ToBase64String(native),"application/json");
        }
        return request.Format.ToLowerInvariant() switch
        {
            "xlsx" => new ExportResult("escala.xlsx", Convert.ToBase64String(ToXlsx(request.Document)), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
            "pdf" => new ExportResult("escala.pdf", Convert.ToBase64String(SchedulePdfExporter.Export(request.Document)), "application/pdf"),
            _ => throw new FormatException("Formato de exportação não suportado.")
        };
    }

    public EscalaLivreDocument Import(ImportRequest request)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.ContentBase64) || request.ContentBase64.Length > NativeDocumentLimits.MaxBase64Characters
            || string.IsNullOrWhiteSpace(request.FileName) || request.FileName.Length > 256 || request.Format is null)
            throw new FormatException("Arquivo inválido ou maior que 1 MiB.");
        byte[] bytes = Convert.FromBase64String(request.ContentBase64);
        if (bytes.Length > NativeDocumentLimits.MaxBytes) throw new FormatException("Arquivo maior que 1 MiB.");
        string content = new UTF8Encoding(false, true).GetString(bytes);
        if (request.Format.Equals("native", StringComparison.OrdinalIgnoreCase) || request.FileName.EndsWith(".escalalivre", StringComparison.OrdinalIgnoreCase))
        {
            var document = JsonSerializer.Deserialize<EscalaLivreDocument>(content, JsonOptions);
            if (DocumentSafety.Error(document) is not null) throw new FormatException("Documento inválido.");
            return WithPlanningPeriod(document!);
        }

        throw new FormatException("Formato de importação não suportado.");
    }

    private static EscalaLivreDocument WithPlanningPeriod(EscalaLivreDocument document)
    {
        if (document.PlanningPeriod is not null) return document;
        var first = document.Assignments.Count > 0 ? document.Assignments.Min(a => a.Start) : TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, TimeZoneInfo.FindSystemTimeZoneById(document.Company.TimeZone)).DateTime;
        var start = DateOnly.FromDateTime(first);
        return document with { PlanningPeriod = new(start, start.AddDays(6)) };
    }

    private static byte[] ToXlsx(EscalaLivreDocument document)
    {
        using var stream = new MemoryStream();
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, true))
        {
            WriteEntry(archive, "[Content_Types].xml", """
                <?xml version="1.0" encoding="UTF-8"?>
                <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
                  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
                  <Default Extension="xml" ContentType="application/xml"/>
                  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
                  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
                </Types>
                """);
            WriteEntry(archive, "_rels/.rels", """
                <?xml version="1.0" encoding="UTF-8"?>
                <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
                </Relationships>
                """);
            WriteEntry(archive, "xl/workbook.xml", """
                <?xml version="1.0" encoding="UTF-8"?>
                <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
                  <sheets><sheet name="Escala" sheetId="1" r:id="rId1"/></sheets>
                </workbook>
                """);
            WriteEntry(archive, "xl/_rels/workbook.xml.rels", """
                <?xml version="1.0" encoding="UTF-8"?>
                <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
                </Relationships>
                """);
            WriteEntry(archive, "xl/worksheets/sheet1.xml", BuildWorksheet(document));
        }

        return stream.ToArray();
    }

    private static string BuildWorksheet(EscalaLivreDocument document)
    {
        var rows = new List<string[]>
        {
            new[] { "Funcionario", "Funcao", "Inicio", "Fim", "Intervalo inicio", "Intervalo fim", "Origem" }
        };
        rows.AddRange(document.Assignments.Select(assignment =>
        {
            Employee? employee = document.Employees.FirstOrDefault(x => x.Id == assignment.EmployeeId);
            return new[]
            {
                employee?.Name ?? assignment.EmployeeId.ToString(),
                assignment.Role,
                assignment.Start.ToString("O"),
                assignment.End.ToString("O"),
                assignment.Break?.Start.ToString("O") ?? "",
                assignment.Break?.End.ToString("O") ?? "",
                assignment.Source
            };
        }));

        IEnumerable<string> rowXml = rows.Select((row, index) =>
        {
            IEnumerable<string> cells = row.Select((cell, cellIndex) =>
                $"<c r=\"{Column(cellIndex)}{index + 1}\" t=\"inlineStr\"><is><t>{EscapeXml(cell)}</t></is></c>");
            return $"<row r=\"{index + 1}\">{string.Concat(cells)}</row>";
        });

        return $"""
            <?xml version="1.0" encoding="UTF-8"?>
            <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
              <sheetData>{string.Concat(rowXml)}</sheetData>
            </worksheet>
            """;
    }

    private static void WriteEntry(ZipArchive archive, string path, string content)
    {
        ZipArchiveEntry entry = archive.CreateEntry(path);
        using var writer = new StreamWriter(entry.Open(), Encoding.UTF8);
        writer.Write(content);
    }

    private static string Column(int index)
        => ((char)('A' + index)).ToString();

    private static string EscapeXml(string value)
        => value.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;");

}
