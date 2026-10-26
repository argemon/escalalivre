using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Application.Scheduling;

public sealed class ScheduleAnalyzer(ScheduleEvaluator evaluator) : IScheduleAnalyzer
{
    public ScheduleResult Analyze(ScheduleRequest request)
        => ScheduleResultAssembler.From(request,
            evaluator.Evaluate(request.Document, request.Start, request.End, request.Document.Assignments));
}
