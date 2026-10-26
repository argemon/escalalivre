using EscalaLivre.Application.Contracts;

namespace EscalaLivre.Application.Scheduling;

// Read-only evaluation. Both analysis and validation consume this capability.
public interface IScheduleAnalyzer
{
    ScheduleResult Analyze(ScheduleRequest request);
}
