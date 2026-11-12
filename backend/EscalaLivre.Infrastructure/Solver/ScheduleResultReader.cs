using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Scheduling;
using EscalaLivre.Domain.Scheduling;
using Google.OrTools.Sat;

namespace EscalaLivre.Infrastructure.Solver;

public sealed class ScheduleResultReader
{
    internal ScheduleOptimizationResult Read(ScheduleModelContext context, OrToolsRun run)
    {
        var request = context.Input.Request;
        var candidates = context.Input.Candidates;
        var decisionVars = context.DecisionVars;
        var status = run.Status;
        var solver = run.Solver;
        if (status is not (CpSolverStatus.Feasible or CpSolverStatus.Optimal))
            return new(request.Document.Assignments, [],
                status == CpSolverStatus.Unknown ? "timeout" : status == CpSolverStatus.Infeasible ? "infeasible" : "invalid",
                [new ScheduleIssue("error", status == CpSolverStatus.Unknown ? "solverTimeout" : status == CpSolverStatus.Infeasible ? "solverInfeasible" : "solverInvalid", status == CpSolverStatus.Unknown ? "O limite de tempo terminou sem uma escala viavel." : status == CpSolverStatus.Infeasible ? "Não foi possível cumprir a carga contratada e as demais restrições obrigatórias no período. Confira jornada, disponibilidade, folgas e funcionamento. Os turnos anteriores foram preservados." : "O modelo de otimização não pôde ser validado.", request.Start, request.End)]);

        var assignments = candidates.Where(x => solver.Value(decisionVars[x.Id]) == 1).ToList();
        return new(ScheduleWindow.Replace(request.Document.Assignments, assignments, request.Start, request.End),
            assignments, status == CpSolverStatus.Optimal ? "optimal" : "feasible", []);
    }
}
