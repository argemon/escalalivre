using EscalaLivre.Application.Contracts;

namespace EscalaLivre.Application.Scheduling;

public interface IScheduleSolver
{
    ScheduleResult Solve(ScheduleRequest request);
    ScheduleResult Validate(ScheduleRequest request);
    ScheduleResult Analyze(ScheduleRequest request);
}
