namespace EscalaLivre.Infrastructure.Solver;

public sealed class ScheduleComplexityException : Exception
{
    public ScheduleComplexityException() : base("Planejamento acima dos limites de complexidade.") { }
}
