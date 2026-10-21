using System.Threading.RateLimiting;
using EscalaLivre.Application.Validation;
using EscalaLivre.Infrastructure.ImportExport;
using FluentValidation;

namespace EscalaLivre.Api;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddEscalaLivre(this IServiceCollection services, ProtectionOptions protection)
    {
        services.ConfigureHttpJsonOptions(options => EscalaLivre.Application.Contracts.ScheduleJson.Configure(options.SerializerOptions));
        services.AddSingleton(protection);
        services.AddSingleton<CalculationWorker>();
        services.AddValidatorsFromAssemblyContaining<ScheduleRequestValidator>();
        services.AddSingleton<NativeScheduleSerializer>();
        services.AddCors(options => options.AddDefaultPolicy(policy =>
        {
            if (protection.AllowedOrigins.Length > 0) policy.WithOrigins(protection.AllowedOrigins);
            else policy.SetIsOriginAllowed(_ => false);
            policy.WithMethods("POST", "GET").WithHeaders("Content-Type").WithExposedHeaders("Retry-After");
        }));
        services.AddRateLimiter(options =>
        {
            options.GlobalLimiter = PartitionedRateLimiter.CreateChained(
                PartitionedRateLimiter.Create<HttpContext, string>(_ => RateLimitPartition.GetConcurrencyLimiter("global", _ => new()
                { PermitLimit = protection.ConcurrentRequests, QueueLimit = 0 })),
                PartitionedRateLimiter.Create<HttpContext, string>(context => RateLimitPartition.GetFixedWindowLimiter(
                    context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new()
                    { PermitLimit = protection.RequestsPerMinute, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 })),
                PartitionedRateLimiter.Create<HttpContext, string>(context => context.Request.Path.Equals("/solve", StringComparison.OrdinalIgnoreCase)
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
