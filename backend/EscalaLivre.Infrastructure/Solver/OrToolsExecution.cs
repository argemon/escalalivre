using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Scheduling;
using EscalaLivre.Domain.Scheduling;
using Google.OrTools.Sat;

namespace EscalaLivre.Infrastructure.Solver;

internal sealed record OrToolsRun(CpSolverStatus Status, CpSolver Solver);

public sealed class OrToolsExecution
{
    public const double MaximumSeconds = 5;
    internal OrToolsRun Solve(CpModel model) => Solve(model, MaximumSeconds);

    internal OrToolsRun Solve(CpModel model, double seconds)
    {
        var solver = new CpSolver
        {
            StringParameters = $"max_time_in_seconds:{seconds.ToString(System.Globalization.CultureInfo.InvariantCulture)},num_search_workers:1"
        };
        return new(solver.Solve(model), solver);
    }
}
