using EscalaLivre.Application.Scheduling;
using EscalaLivre.Application.Validation;
using EscalaLivre.Infrastructure.ImportExport;
using EscalaLivre.Infrastructure.Solver;
using FluentValidation;

namespace EscalaLivre.Api;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddEscalaLivre(this IServiceCollection services)
    {
        services.AddValidatorsFromAssemblyContaining<ScheduleRequestValidator>();
        services.AddSingleton<IScheduleSolver, OrToolsScheduleSolver>();
        services.AddSingleton<NativeScheduleSerializer>();
        services.AddCors(options => options.AddDefaultPolicy(policy => policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));
        return services;
    }
}
