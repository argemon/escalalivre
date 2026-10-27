// Instrumentation compiled exclusively in isolated benchmark Infrastructure copies.
using Google.OrTools.Sat;
namespace EscalaLivre.Infrastructure.Solver;
public static class PerformanceModelProbe
{
    public static int Candidates,Variables,Constraints,SerializedBytes,Steps;
    public static double? Objective,Bound,SolverWallSeconds;
    public static long? Branches,Conflicts;
    public static void Reset(){Candidates=Variables=Constraints=SerializedBytes=Steps=0;Objective=Bound=SolverWallSeconds=null;Branches=Conflicts=null;}
    public static void Capture(ScheduleModelContext context,OptimizationBudget budget){Variables=context.Model.Model.Variables.Count;Constraints=context.Model.Model.Constraints.Count;SerializedBytes=context.Model.Model.CalculateSize();Steps=budget.ModelSteps;}
    public static void Capture(CpSolver solver){Objective=solver.ObjectiveValue;Bound=solver.BestObjectiveBound;SolverWallSeconds=solver.WallTime();Branches=solver.NumBranches();Conflicts=solver.NumConflicts();}
}
