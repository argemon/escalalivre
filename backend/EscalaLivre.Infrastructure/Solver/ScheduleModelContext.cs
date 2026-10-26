using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Scheduling;
using EscalaLivre.Domain.Scheduling;
using Google.OrTools.Sat;

namespace EscalaLivre.Infrastructure.Solver;

public sealed class ScheduleModelContext(ScheduleModelInput input)
{
    public ScheduleModelInput Input { get; } = input;
    internal CpModel Model { get; } = new();
    internal Dictionary<Guid, BoolVar> DecisionVars { get; } = new();
    internal List<LinearExpr> ShortageTerms { get; } = [];
    internal List<LinearExpr> OccupancyTerms { get; } = [];
}

public interface IScheduleConstraintTranslator
{
    void Apply(ScheduleModelContext context, OptimizationBudget budget);
}
