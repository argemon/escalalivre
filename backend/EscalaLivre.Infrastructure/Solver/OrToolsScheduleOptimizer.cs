using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Scheduling;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Infrastructure.Solver;

public sealed class OrToolsScheduleOptimizer(ScheduleCandidateGenerator generator, ScheduleModelBuilder builder,
    OrToolsExecution execution, ScheduleResultReader reader) : IScheduleOptimizer
{
    public ScheduleOptimizationResult Optimize(ScheduleRequest request)
    {
        var budget = new OptimizationBudget();
        var input = new ScheduleModelInput(request, generator.Generate(request), budget);
        var context = builder.Build(input, budget);
        return reader.Read(context, execution.Solve(context.Model));
    }
}
