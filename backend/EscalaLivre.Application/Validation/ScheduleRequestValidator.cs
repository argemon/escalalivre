using EscalaLivre.Application.Contracts;
using FluentValidation;

namespace EscalaLivre.Application.Validation;

public sealed class ScheduleRequestValidator : AbstractValidator<ScheduleRequest>
{
    public ScheduleRequestValidator()
    {
        RuleFor(x => x.Document.SchemaVersion).NotEmpty();
        RuleFor(x => x.Document.Id).NotEmpty();
        RuleFor(x => x.Start).LessThan(x => x.End);
        RuleFor(x => x.Document.Company.MinimumRest).GreaterThanOrEqualTo(TimeSpan.FromHours(11));
        RuleForEach(x => x.Document.Employees).ChildRules(employee =>
        {
            employee.RuleFor(x => x.Id).NotEmpty();
            employee.RuleFor(x => x.Name).NotEmpty();
            employee.RuleFor(x => x.Role).NotEmpty();
            employee.RuleFor(x => x.Workload.WeeklyLimitHours).LessThanOrEqualTo(44);
        });
    }
}
