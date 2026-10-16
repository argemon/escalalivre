using System.Text;
using System.Text.Json;
using System.IO.Compression;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Infrastructure.ImportExport;

public sealed class NativeScheduleSerializer
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    public ExportResult Export(ExportRequest request)
    {
        string json = JsonSerializer.Serialize(request.Document, JsonOptions);
        return request.Format.ToLowerInvariant() switch
        {
            "native" or "escalalivre" => new ExportResult("escala.escalalivre", Convert.ToBase64String(Encoding.UTF8.GetBytes(json)), "application/json"),
            "xlsx" => new ExportResult("escala.xlsx", Convert.ToBase64String(ToXlsx(request.Document)), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
            "pdf" => new ExportResult("escala.pdf", Convert.ToBase64String(ToPdf(request.Document)), "application/pdf"),
            _ => throw new InvalidOperationException("Formato de exportacao nao suportado.")
        };
    }

    public EscalaLivreDocument Import(ImportRequest request)
    {
        string content = Encoding.UTF8.GetString(Convert.FromBase64String(request.ContentBase64));
        if (request.Format.Equals("native", StringComparison.OrdinalIgnoreCase) || request.FileName.EndsWith(".escalalivre", StringComparison.OrdinalIgnoreCase))
        {
            return JsonSerializer.Deserialize<EscalaLivreDocument>(content, JsonOptions)
                ?? throw new InvalidOperationException("Arquivo nativo invalido.");
        }

        throw new InvalidOperationException("Importacao parcial de XLSX esta reservada para o adaptador de planilhas.");
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

    private static byte[] ToPdf(EscalaLivreDocument document)
    {
        string[] lines = new[] { $"EscalaLivre - {document.Company.Name}" }
            .Concat(document.Assignments.Select(x => $"{x.Role} {x.Start:g} - {x.End:g}"))
            .ToArray();
        string content = string.Join("\\n", lines.Select(EscapePdf));
        string[] objects = new[]
        {
            "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
            "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
            "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n",
            "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
            $"5 0 obj << /Length {content.Length + 42} >> stream\nBT /F1 12 Tf 48 792 Td ({content}) Tj ET\nendstream endobj\n"
        };
        var builder = new StringBuilder("%PDF-1.4\n");
        var offsets = new List<int> { 0 };
        foreach (string? item in objects)
        {
            offsets.Add(Encoding.ASCII.GetByteCount(builder.ToString()));
            builder.Append(item);
        }

        int xrefStart = Encoding.ASCII.GetByteCount(builder.ToString());
        builder.Append($"xref\n0 {objects.Length + 1}\n0000000000 65535 f \n");
        builder.Append(string.Concat(offsets.Skip(1).Select(offset => $"{offset:0000000000} 00000 n \n")));
        builder.Append($"trailer << /Size {objects.Length + 1} /Root 1 0 R >>\nstartxref\n{xrefStart}\n%%EOF");
        return Encoding.ASCII.GetBytes(builder.ToString());
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

    private static string EscapePdf(string value)
        => value.Replace("\\", "\\\\").Replace("(", "\\(").Replace(")", "\\)");
}
