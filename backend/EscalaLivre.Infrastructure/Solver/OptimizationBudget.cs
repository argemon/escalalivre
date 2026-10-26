namespace EscalaLivre.Infrastructure.Solver;

// One instance per calculation; never share the step counter across requests.
public sealed class OptimizationBudget
{
    public const int MaximumCandidates = 30_000;
    public const int MaximumModelSteps = 300_000;
    public int ModelSteps { get; private set; }
    public void CheckCandidates(int count) { if (count > MaximumCandidates) throw new ScheduleComplexityException(); }
    public void Spend() { if (++ModelSteps > MaximumModelSteps) throw new ScheduleComplexityException(); }
}
