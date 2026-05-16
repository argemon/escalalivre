using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Application.Contracts;

public sealed record ScheduleRequest(EscalaLivreDocument Document, DateTime Start, DateTime End);

public sealed record ScheduleResult(
    IReadOnlyList<ShiftAssignment> Assignments,
    IReadOnlyList<ScheduleIssue> Conflicts,
    IReadOnlyList<CoverageGap> Gaps,
    IReadOnlyList<HiringSuggestion> HiringSuggestions,
    double CoverageScore);

public sealed record ImportRequest(string FileName, string ContentBase64, string Format);

public sealed record ExportRequest(EscalaLivreDocument Document, string Format);

public sealed record ExportResult(string FileName, string ContentBase64, string MimeType);
