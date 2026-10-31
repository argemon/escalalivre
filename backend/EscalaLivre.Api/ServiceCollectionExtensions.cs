using EscalaLivre.Domain.Regimes;
using System.Threading.RateLimiting;
using EscalaLivre.Application.Validation;
using EscalaLivre.Application.Scheduling;
using EscalaLivre.Application.Planning;
using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Infrastructure.Solver;
using EscalaLivre.Infrastructure.ImportExport;
using FluentValidation;

namespace EscalaLivre.Api;

public static class ServiceCollectionExtensions
{
    // Used in the child process. The HTTP host keeps calculations behind CalculationWorker.
    public static IServiceCollection AddScheduleAnalysis(this IServiceCollection services)
    {
        services.AddSingleton<IShiftRegime, DayBasedRegime>();
        services.AddSingleton<IShiftRegime, HourBasedRegime>();
        services.AddSingleton<ShiftRegimeFactory>();
        services.AddSingleton<ScheduleEvaluator>();
        services.AddSingleton<IScheduleAnalyzer, ScheduleAnalyzer>();
        services.AddSingleton<AnalyzeSchedule>();
        services.AddSingleton<ValidateSchedule>();
        services.AddSingleton<PlanningEditor>();
        return services;
    }

    public static IServiceCollection AddScheduleOptimization(this IServiceCollection services)
    {
        services.AddSingleton<ScheduleCandidateGenerator>();
        services.AddSingleton<IScheduleConstraintTranslator, FixedAssignmentConstraints>();
        services.AddSingleton<IScheduleConstraintTranslator, DailyExclusivityConstraints>();
        services.AddSingleton<IScheduleConstraintTranslator, RestConstraints>();
        services.AddSingleton<IScheduleConstraintTranslator, WeeklyWorkConstraints>();
        services.AddSingleton<IScheduleConstraintTranslator, DayCycleConstraints>();
        services.AddSingleton<IScheduleConstraintTranslator, CoverageConstraints>();
        services.AddSingleton<ScheduleObjective>();
        services.AddSingleton<ScheduleModelBuilder>();
        services.AddSingleton<OrToolsExecution>();
        services.AddSingleton<ScheduleResultReader>();
        services.AddSingleton<IScheduleOptimizer, OrToolsScheduleOptimizer>();
        services.AddSingleton<GenerateSchedule>();
        return services;
    }

    private static RequestQuotaKind QuotaFor(HttpContext context) =>
        context.GetEndpoint()?.Metadata.GetMetadata<RequestQuota>()?.Kind ?? RequestQuotaKind.General;

    public static IServiceCollection AddEscalaLivre(this IServiceCollection services, ProtectionOptions protection)
    {
        services.ConfigureHttpJsonOptions(options => EscalaLivre.Application.Contracts.ScheduleJson.Configure(options.SerializerOptions));
        services.AddSingleton(protection);
        services.AddSingleton<CalculationWorker>();
        services.AddSingleton<ICalculationRunner>(sp => sp.GetRequiredService<CalculationWorker>());
        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<ScheduleJobQueue>();
        services.AddHostedService(sp => sp.GetRequiredService<ScheduleJobQueue>());
        services.AddValidatorsFromAssemblyContaining<ScheduleRequestValidator>();
        services.AddSingleton<NativeScheduleSerializer>();
        services.AddCors(options => options.AddDefaultPolicy(policy =>
        {
            if (protection.AllowedOrigins.Length > 0) policy.WithOrigins(protection.AllowedOrigins);
            else policy.SetIsOriginAllowed(_ => false);
            policy.WithMethods("POST", "GET", "DELETE").WithHeaders("Content-Type").WithExposedHeaders("Retry-After");
        }));
        services.AddRateLimiter(options =>
        {
            options.GlobalLimiter = PartitionedRateLimiter.CreateChained(
                PartitionedRateLimiter.Create<HttpContext, string>(_ => RateLimitPartition.GetConcurrencyLimiter("global", _ => new()
                { PermitLimit = protection.ConcurrentRequests, QueueLimit = 0 })),
                PartitionedRateLimiter.Create<HttpContext, (RequestQuotaKind, string)>(context =>
                {
                    var quota = QuotaFor(context);
                    // Generation also consumes the general per-IP quota. Job operations
                    // have independent budgets so polling cannot prevent cancellation.
                    var category = quota is RequestQuotaKind.JobPoll or RequestQuotaKind.JobCancellation
                        ? quota : RequestQuotaKind.General;
                    int limit = category switch
                    {
                        RequestQuotaKind.JobPoll => protection.JobPollsPerMinute,
                        RequestQuotaKind.JobCancellation => protection.JobCancellationsPerMinute,
                        _ => protection.RequestsPerMinute
                    };
                    return RateLimitPartition.GetFixedWindowLimiter(
                        (category, context.Connection.RemoteIpAddress?.ToString() ?? "unknown"), _ => new()
                        { PermitLimit = limit, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 });
                }),
                PartitionedRateLimiter.Create<HttpContext, string>(context => QuotaFor(context) == RequestQuotaKind.Generation
                    ? RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new()
                    { PermitLimit = protection.SolvesPerMinute, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 })
                    : RateLimitPartition.GetNoLimiter("other")));
            options.OnRejected = async (context, cancellation) =>
            {
                context.HttpContext.Response.StatusCode = 429;
                int retry = context.Lease.TryGetMetadata(MetadataName.RetryAfter, out TimeSpan delay) ? Math.Max(1, (int)Math.Ceiling(delay.TotalSeconds)) : 5;
                context.HttpContext.Response.Headers.RetryAfter = retry.ToString(System.Globalization.CultureInfo.InvariantCulture);
                context.HttpContext.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("Protection").LogWarning("API request throttled");
                await context.HttpContext.Response.WriteAsJsonAsync(ApiFailure.Envelope("rateLimited", "Muitas solicitações. Aguarde antes de tentar novamente."), cancellation);
            };
        });
        return services;
    }
}
