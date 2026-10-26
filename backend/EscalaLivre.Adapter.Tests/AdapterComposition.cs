using EscalaLivre.Application.Scheduling;
using EscalaLivre.Infrastructure.Solver;
using EscalaLivre.TestSupport;

namespace EscalaLivre.Adapter.Tests;

// Test composition returns real capabilities, never a combined solver/analyzer facade.
internal static class AdapterComposition
{
    internal static ScheduleModelBuilder Builder() => new(
        [new FixedAssignmentConstraints(), new DailyExclusivityConstraints(), new RestConstraints(),
         new WeeklyWorkConstraints(), new DayCycleConstraints(), new CoverageConstraints()], new());
    internal static GenerateSchedule Generate() => new(
        new OrToolsScheduleOptimizer(new(), Builder(), new(), new()), PureComposition.Analyzer());
}
