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
    internal List<LinearExpr> CoverageDeficitTerms { get; } = [];
    internal LinearExpr? ContractCredit { get; set; }
    internal LinearExpr? PreferenceObjective { get; set; }
    internal List<LinearExpr> ShortageTerms { get; } = [];
    internal List<LinearExpr> OccupancyTerms { get; } = [];
    internal Dictionary<Guid, long> IntervalExtensionSeconds { get; } = new();
    internal LinearExpr? IntervalExtension { get; set; }
    internal BoolVar? PreferMinimumIntervals { get; set; }
    internal BoolVar? PreferUnanticipatedIntervals { get; set; }
}

public interface IScheduleConstraintTranslator
{
    void Apply(ScheduleModelContext context, OptimizationBudget budget);
}
