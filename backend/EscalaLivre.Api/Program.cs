using System.Diagnostics;
using System.Net;
using System.Text.Json;
using EscalaLivre.Api;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Validation;
using EscalaLivre.Infrastructure.ImportExport;
using FluentValidation;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Http.Timeouts;

if (args.Length == 2 && args[0] == "--calculation-worker")
{
    Environment.ExitCode = await CalculationWorker.ExecuteAsync(args[1]);
    return;
}

const long maxRequestBodyBytes = 2 * 1024 * 1024;
WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
var protection = builder.Configuration.GetSection("Protection").Get<ProtectionOptions>() ?? new();
protection.Validate();
builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = maxRequestBodyBytes;
    options.Limits.MaxConcurrentConnections = 100;
    options.Limits.RequestHeadersTimeout = TimeSpan.FromSeconds(10);
    options.AddServerHeader = false;
});
builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.MaxDepth = 32);
builder.Services.Configure<RouteHandlerOptions>(options => options.ThrowOnBadRequest = true);
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.ForwardLimit = 1;
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
    foreach (string address in builder.Configuration.GetSection("Protection:TrustedProxies").Get<string[]>() ?? [])
        options.KnownProxies.Add(IPAddress.Parse(address));
});
builder.Services.AddOpenApi();
builder.Services.AddEscalaLivre(protection);
builder.Services.AddRequestTimeouts(options => options.DefaultPolicy = new RequestTimeoutPolicy
{
    Timeout = TimeSpan.FromSeconds(protection.WorkerTimeoutSeconds + protection.QueueWaitSeconds + 5),
    TimeoutStatusCode = 504,
    WriteTimeoutResponse = context => context.Response.WriteAsJsonAsync(ApiFailure.Envelope("requestTimeout", "A solicitação atingiu o tempo limite. Tente novamente."))
});

WebApplication app = builder.Build();
// Do not enable forwarded headers unless specific proxy addresses were configured.
if ((builder.Configuration.GetSection("Protection:TrustedProxies").Get<string[]>() ?? []).Length > 0) app.UseForwardedHeaders();
if (!app.Environment.IsDevelopment()) app.UseHsts();
app.Use(async (context, next) =>
{
    context.Response.Headers.XContentTypeOptions = "nosniff";
    context.Response.Headers.XFrameOptions = "DENY";
    context.Response.Headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    context.Response.Headers.CacheControl = "no-store";
    var clock = Stopwatch.StartNew();
    // A client can stall while the JSON binder is still reading. Abort the
    // transport after a short grace period even if cooperative timeout handling
    // has not returned from that read yet.
    using var hardDeadline = new CancellationTokenSource(TimeSpan.FromSeconds(protection.WorkerTimeoutSeconds + protection.QueueWaitSeconds + 6));
    using var abortTransport = hardDeadline.Token.Register(context.Abort);
    try { await next(context); }
    catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested) { context.Response.StatusCode = 499; }
    catch (Exception exception) when (!context.Response.HasStarted)
    {
        var (status, code, message) = exception switch
        {
            ApiFailure failure => (failure.Status, failure.Code, failure.Message),
            BadHttpRequestException bad => (bad.StatusCode, "invalidRequest", bad.StatusCode == 413 ? "Arquivo ou pedido maior que 2 MB." : "Pedido inválido ou incompleto."),
            JsonException or FormatException or System.Text.DecoderFallbackException => (400, "invalidFile", "Arquivo ou conteúdo inválido."),
            _ => (500, "internalError", "Não foi possível concluir a solicitação.")
        };
        // Never log the exception message: JSON parsers can include personal input.
        app.Logger.LogWarning("API failure {Code}, type {ExceptionType}", code, exception.GetType().Name);
        context.Response.StatusCode = status;
        if (status is 429 or 503) context.Response.Headers.RetryAfter = "5";
        await context.Response.WriteAsJsonAsync(ApiFailure.Envelope(code, message), context.RequestAborted);
    }
    finally
    {
        string route = context.GetEndpoint()?.DisplayName ?? "unmatched";
        app.Logger.LogInformation("API {Route} returned {Status} in {DurationMs}ms", route, context.Response.StatusCode, clock.ElapsedMilliseconds);
    }
});
app.UseRouting();
app.UseRequestTimeouts();
app.UseCors();
app.UseRateLimiter();
app.Use(async (context, next) =>
{
    // Reject declared oversized bodies before the JSON binder asks Kestrel to read.
    // Keep Kestrel's independent limit for streamed bodies without Content-Length.
    if (context.Request.ContentLength > maxRequestBodyBytes)
    {
        context.Response.StatusCode = StatusCodes.Status413PayloadTooLarge;
        // This request is already rejected and never reaches binding or calculation.
        // Allow Kestrel to discard its declared body within the server's bounded
        // drain timeout, rather than abort the connection with a second size error.
        var bodyLimit = context.Features.Get<IHttpMaxRequestBodySizeFeature>();
        if (bodyLimit is { IsReadOnly: false }) bodyLimit.MaxRequestBodySize = context.Request.ContentLength;
        await context.Response.WriteAsJsonAsync(ApiFailure.Envelope("invalidRequest", "Arquivo ou pedido maior que 2 MB."), context.RequestAborted);
        return;
    }
    await next(context);
});
if (app.Environment.IsDevelopment()) app.MapOpenApi();
app.MapGet("/", () => ApiEnvelope<object>.Ok(new { product = "EscalaLivre", mode = "local-first", endpoints = new[] { "/solve", "/validate", "/analyze", "/import", "/export" } }));
app.MapGet("/health", () => Results.Ok(new { status = "healthy" }));
foreach (string operation in new[] { "solve", "validate", "analyze" })
{
    var endpoint = app.MapPost("/" + operation, async (ScheduleRequest request, CalculationWorker worker, IValidator<ScheduleRequest> validator, CancellationToken cancellation) =>
    {
        var validation = await validator.ValidateAsync(request, cancellation);
        if (!validation.IsValid)
            return Results.BadRequest(ApiEnvelope<ScheduleResult>.Fail(validation.Errors.Select(e => new ApiMessage("invalidRequest", e.ErrorMessage, e.PropertyName)).ToList()));
        return Results.Ok(ApiEnvelope<ScheduleResult>.Ok(await worker.RunAsync(operation, request, cancellation)));
    });
    if (operation == "solve") endpoint.WithMetadata(new RequestQuota(RequestQuotaKind.Generation));
}
app.MapPost("/import", (ImportRequest request, NativeScheduleSerializer serializer) => ApiEnvelope<object>.Ok(serializer.Import(request)));
app.MapPost("/export", (ExportRequest request, NativeScheduleSerializer serializer) => ApiEnvelope<ExportResult>.Ok(serializer.Export(request)));
app.MapPost("/solve/jobs", async (ScheduleRequest request, ScheduleJobQueue jobs, IValidator<ScheduleRequest> validator, HttpContext context) =>
{
    var validation = await validator.ValidateAsync(request, context.RequestAborted);
    if (!validation.IsValid)
        return Results.BadRequest(ApiEnvelope<JobProgress>.Fail(validation.Errors.Select(e => new ApiMessage("invalidRequest", e.ErrorMessage, e.PropertyName)).ToList()));
    var progress = jobs.Enqueue(request);
    return Results.Json(ApiEnvelope<JobProgress>.Ok(progress), statusCode: 202);
}).WithMetadata(new RequestQuota(RequestQuotaKind.Generation));
app.MapGet("/solve/jobs/{id}", (string id, ScheduleJobQueue jobs) =>
    ApiEnvelope<JobProgress>.Ok(jobs.Get(id))).WithMetadata(new RequestQuota(RequestQuotaKind.JobPoll));
app.MapDelete("/solve/jobs/{id}", (string id, ScheduleJobQueue jobs) =>
    ApiEnvelope<JobProgress>.Ok(jobs.Cancel(id))).WithMetadata(new RequestQuota(RequestQuotaKind.JobCancellation));
app.Run();
