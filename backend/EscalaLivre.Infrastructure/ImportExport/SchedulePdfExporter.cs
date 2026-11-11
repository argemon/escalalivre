using System.Globalization;
using EscalaLivre.Domain.Scheduling;
using MigraDoc.DocumentObjectModel;
using MigraDoc.Rendering;
using PdfSharp.Fonts;
using PdfSharp.Drawing;
using PdfSharp.Pdf;

namespace EscalaLivre.Infrastructure.ImportExport;

internal static class SchedulePdfExporter
{
    static SchedulePdfExporter() => GlobalFontSettings.FontResolver ??= new ScheduleFontResolver();

    public static byte[] Export(EscalaLivreDocument schedule,string? publicationLabel=null)
    {
        var document=new Document();
        document.Info.Title="Escala da equipe - "+schedule.Company.Name;
        document.Info.Author="Escala Livre";
        var normal=document.Styles[StyleNames.Normal]!;
        normal.Font.Name="Escala Sans";normal.Font.Size=8.5;
        normal.Font.Color=Colors.DarkSlateGray;
        normal.ParagraphFormat.SpaceAfter=Unit.FromPoint(3);

        var section=document.AddSection();
        section.PageSetup.PageFormat=PageFormat.A4;section.PageSetup.Orientation=Orientation.Landscape;
        section.PageSetup.LeftMargin=section.PageSetup.RightMargin=Unit.FromCentimeter(1.7);
        section.PageSetup.TopMargin=Unit.FromCentimeter(1.8);section.PageSetup.BottomMargin=Unit.FromCentimeter(1.6);
        section.PageSetup.HeaderDistance=section.PageSetup.FooterDistance=Unit.FromCentimeter(.7);
        var header=section.Headers.Primary.AddParagraph("ESCALA LIVRE / ESCALA DA EQUIPE"+(publicationLabel is null?"":" · "+publicationLabel));
        header.Format.Font.Size=8;header.Format.Font.Color=Colors.Gray;
        var footer=section.Footers.Primary.AddParagraph();footer.Format.Alignment=ParagraphAlignment.Right;
        footer.AddText("Página ");footer.AddPageField();footer.AddText(" de ");footer.AddNumPagesField();

        var title=section.AddParagraph(BreakLongWords(schedule.Company.Name));
        title.Format.Font.Size=17;title.Format.Font.Bold=true;title.Format.SpaceAfter=Unit.FromPoint(7);
        if(publicationLabel is not null)section.AddParagraph(publicationLabel).Format.Font.Bold=true;
        if(schedule.PlanningPeriod is { } period)
            section.AddParagraph($"Planejamento: {period.Start:dd/MM/yyyy} a {period.End:dd/MM/yyyy}");
        section.AddParagraph($"Inclui todos os {schedule.Assignments.Count} turnos salvos.")
            .Format.SpaceAfter=Unit.FromPoint(12);
        if(publicationLabel is not null && schedule.Employees.Count==1)section.AddParagraph("Pessoa: "+BreakLongWords(schedule.Employees[0].Name));
        if(schedule.Assignments.Count==0)section.AddParagraph("Nenhum turno salvo neste documento.");
        else
        {
            var table=section.AddTable();table.Borders.Width=.35;table.Borders.Color=Colors.LightGray;
            table.Rows.LeftIndent=Unit.Zero;table.TopPadding=table.BottomPadding=Unit.FromPoint(5);
            foreach(double width in publicationLabel is null?new[]{6,3.5,4,4,6,2.8}:new[]{6.8,3.5,4.5,4.5,7.0})table.AddColumn(Unit.FromCentimeter(width));
            var heading=table.AddRow();heading.HeadingFormat=true;heading.Format.Font.Bold=true;
            heading.Shading.Color=Color.FromRgb(26,92,75);heading.Format.Font.Color=Colors.White;
            string[] labels=["Funcionário","Função","Início","Fim","Intervalo","Origem"];
            for(int i=0;i<(publicationLabel is null?labels.Length:5);i++)heading.Cells[i].AddParagraph(labels[i]);
            var employees=schedule.Employees.ToDictionary(e=>e.Id);
            string Name(ShiftAssignment shift)=>employees.TryGetValue(shift.EmployeeId,out var person)?person.Name:shift.EmployeeId.ToString();
            int index=0;
            foreach(var shift in schedule.Assignments.OrderBy(Name,StringComparer.Create(CultureInfo.GetCultureInfo("pt-BR"),true)).ThenBy(s=>s.Start).ThenBy(s=>s.Id))
            {
                var row=table.AddRow();if(index++%2==1)row.Shading.Color=Color.FromRgb(243,247,245);
                string[] cells=[Name(shift),shift.Role,Clock(shift.Start),Clock(shift.End),
                    shift.Break is { } pause?$"{Clock(pause.Start)} - {Clock(pause.End)}":"Sem intervalo",shift.Source=="manual"?"Manual":"Gerado"];
                for(int i=0;i<(publicationLabel is null?cells.Length:5);i++)row.Cells[i].AddParagraph(BreakLongWords(cells[i],i==1?10:20));
            }
        }
        if(publicationLabel is not null)section.AddParagraph("Legenda: intervalo = pausa sem cobertura; sem intervalo = nenhuma pausa registrada. O fim pode ocorrer no dia seguinte.");
        var renderer=new PdfDocumentRenderer{Document=document};renderer.RenderDocument();
        /* Full fonts preserve nested composite accents in this PDFsharp release. */
        foreach(var style in new[]{XFontStyleEx.Regular,XFontStyleEx.Bold})
            renderer.PdfDocument.AddCharacters(new XFont("Escala Sans",8.5,style,new XPdfFontOptions(PdfFontEmbedding.EmbedCompleteFontFile))," ");
        using var output=new MemoryStream();renderer.PdfDocument.Save(output,false);return output.ToArray();
    }
    private static string Clock(DateTime value)=>value.ToString("dd/MM/yyyy HH:mm:ss",CultureInfo.InvariantCulture);
    // Discretionary breaks keep valid, long unspaced names within their table cells.
    private static string BreakLongWords(string text,int maximumRun=20)
    {
        var output=new System.Text.StringBuilder();int length=0;
        foreach(var rune in text.EnumerateRunes())
        {
            if(System.Text.Rune.IsWhiteSpace(rune))length=0;
            else if(length++==maximumRun){output.Append('\u00ad');length=1;}
            output.Append(rune.ToString());
        }
        return output.ToString();
    }
    private sealed class ScheduleFontResolver:IFontResolver
    {
        private static readonly byte[] Regular=Read("NotoSans-Regular.ttf"),Bold=Read("NotoSans-Bold.ttf");
        public FontResolverInfo ResolveTypeface(string familyName,bool bold,bool italic)=>new(bold?"Escala.Bold":"Escala.Regular",false,italic);
        public byte[] GetFont(string faceName)=>faceName=="Escala.Bold"?Bold:Regular;
        private static byte[] Read(string filename)
        {
            using var stream=typeof(SchedulePdfExporter).Assembly.GetManifestResourceStream("EscalaLivre.Fonts."+filename)
                ?? throw new InvalidOperationException("Fonte incorporada ausente: "+filename);
            using var bytes=new MemoryStream();stream.CopyTo(bytes);return bytes.ToArray();
        }
    }
}
