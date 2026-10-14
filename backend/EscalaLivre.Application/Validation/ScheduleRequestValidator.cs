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
        RuleFor(x => x.End).Must((request, end) => end - request.Start <= TimeSpan.FromDays(31)).WithMessage("Periodo maximo: 31 dias.");
        RuleFor(x => x.Document.Employees.Count).LessThanOrEqualTo(200);
        RuleFor(x => x.Document.Company.DefaultWorkload.WeeklyLimitHours).GreaterThan(0).LessThanOrEqualTo(44);
        RuleForEach(x => x.Document.Company.Coverage).ChildRules(coverage =>
        {
            coverage.RuleFor(x => x.MinimumEmployees).InclusiveBetween(0, 200);
            coverage.RuleFor(x => x.Role).NotEmpty();
        });
        RuleFor(x => x.Document.Company.MinimumRest).GreaterThanOrEqualTo(TimeSpan.FromHours(11));
        RuleForEach(x => x.Document.Employees).ChildRules(employee =>
        {
            employee.RuleFor(x => x.Id).NotEmpty();
            employee.RuleFor(x => x.Name).NotEmpty();
            employee.RuleFor(x => x.Role).NotEmpty();
            employee.RuleFor(x => x.Workload.WeeklyLimitHours).GreaterThan(0).LessThanOrEqualTo(44);
        });
    }
}
