using EscalaLivre.Application.Contracts;

namespace EscalaLivre.Application.Scheduling;

public sealed class ValidateSchedule(IScheduleAnalyzer analyzer)
{
    public ScheduleResult Execute(ScheduleRequest request) => analyzer.Analyze(request);
}
