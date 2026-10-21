using EscalaLivre.Application.Contracts;
using FluentValidation;

namespace EscalaLivre.Application.Validation;

public sealed class ScheduleRequestValidator : AbstractValidator<ScheduleRequest>
{
    public ScheduleRequestValidator()
    {
        RuleFor(x => x).Custom((request, context) =>
        {
            if (DocumentSafety.Error(request.Document) is { } error) context.AddFailure("Document", error);
            if (request.Document?.PlanningPeriod is { } period &&
                (request.Start != period.Start.ToDateTime(TimeOnly.MinValue) || request.End != period.End.ToDateTime(new TimeOnly(23, 59, 59))))
                context.AddFailure("PlanningPeriod", "O período da requisição deve corresponder ao documento.");
            if (!DocumentSafety.SafeDate(request.Start) || !DocumentSafety.SafeDate(request.End)
                || request.End <= request.Start || request.End - request.Start > TimeSpan.FromDays(31)
                || (request.End.Date - request.Start.Date).TotalDays >= 31)
                context.AddFailure("End", "Período inválido. Use no máximo 31 dias de calendário, entre 1900 e 2100.");
        });
    }
}
