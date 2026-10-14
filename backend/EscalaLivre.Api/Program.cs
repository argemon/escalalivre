using EscalaLivre.Api;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Scheduling;
using EscalaLivre.Infrastructure.ImportExport;
using FluentValidation;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddOpenApi();
builder.Services.AddEscalaLivre();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors();

app.MapGet("/", () => ApiEnvelope<object>.Ok(new
{
    product = "EscalaLivre",
    mode = "local-first",
    endpoints = new[] { "/solve", "/validate", "/analyze", "/import", "/export" }
}));

app.MapPost("/solve", async (ScheduleRequest request, IScheduleSolver solver, IValidator<ScheduleRequest> validator) =>
{
    var validation = await validator.ValidateAsync(request);
    if (!validation.IsValid)
    {
        return Results.BadRequest(ApiEnvelope<ScheduleResult>.Fail(validation.Errors.Select(x => new ApiMessage(x.ErrorCode, x.ErrorMessage, x.PropertyName)).ToList()));
    }

    return Results.Ok(ApiEnvelope<ScheduleResult>.Ok(solver.Solve(request)));
});

foreach (var endpoint in new[] { "/validate", "/analyze" })
{
    app.MapPost(endpoint, async (ScheduleRequest request, IScheduleSolver solver, IValidator<ScheduleRequest> validator) =>
    {
        var validation = await validator.ValidateAsync(request);
        if (!validation.IsValid)
            return Results.BadRequest(ApiEnvelope<ScheduleResult>.Fail(validation.Errors.Select(x => new ApiMessage(x.ErrorCode, x.ErrorMessage, x.PropertyName)).ToList()));
        return Results.Ok(ApiEnvelope<ScheduleResult>.Ok(solver.Validate(request)));
    });
}

app.MapGet("/health", () => Results.Ok(new { status = "healthy" }));

app.MapPost("/import", (ImportRequest request, NativeScheduleSerializer serializer) =>
    ApiEnvelope<object>.Ok(serializer.Import(request)));

app.MapPost("/export", (ExportRequest request, NativeScheduleSerializer serializer) =>
    ApiEnvelope<ExportResult>.Ok(serializer.Export(request)));

app.Run();
