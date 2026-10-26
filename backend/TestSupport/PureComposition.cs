using EscalaLivre.Application.Scheduling;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.TestSupport;

internal static class PureComposition
{
    internal static IScheduleAnalyzer Analyzer() => new ScheduleAnalyzer(new ScheduleEvaluator());
    internal static AnalyzeSchedule Analyze() => new(Analyzer());
    internal static ValidateSchedule Validate() => new(Analyzer());
}
