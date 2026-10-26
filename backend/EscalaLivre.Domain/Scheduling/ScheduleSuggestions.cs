namespace EscalaLivre.Domain.Scheduling;

public static class ScheduleSuggestions
{
    public static IEnumerable<OptimizationSuggestion> Suggest(IReadOnlyList<ShiftAssignment> assignments, IReadOnlyList<CoverageBlock> coverage)
    {
        foreach (CoverageBlock? gap in coverage.Where(x => x.State == "uncovered").Take(8))
        {
            ShiftAssignment? movableBreak = assignments.FirstOrDefault(x =>
                x.Role == gap.Role &&
                x.Start <= gap.Start &&
                x.End >= gap.End &&
                x.Break is not null &&
                x.Break.Start < gap.End &&
                gap.Start < x.Break.End);

            if (movableBreak is not null)
            {
                yield return new OptimizationSuggestion(
                    "moveBreak",
                    $"Mover ou estender o intervalo de {movableBreak.Role} reduz o buraco entre {gap.Start:HH\\h} e {gap.End:HH\\h}.",
                    "Recupera cobertura sem adicionar turno.",
                    movableBreak.EmployeeId,
                    gap.Start,
                    gap.End);
            }
        }
    }

}
