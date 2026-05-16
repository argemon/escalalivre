namespace EscalaLivre.Application.Contracts;

public sealed record ApiEnvelope<T>(
    bool Success,
    T? Data,
    IReadOnlyList<ApiMessage> Errors,
    IReadOnlyList<ApiMessage> Warnings,
    IReadOnlyDictionary<string, object> Metadata)
{
    public static ApiEnvelope<T> Ok(T data, IReadOnlyList<ApiMessage>? warnings = null, IReadOnlyDictionary<string, object>? metadata = null)
        => new(true, data, [], warnings ?? [], metadata ?? new Dictionary<string, object>());

    public static ApiEnvelope<T> Fail(IReadOnlyList<ApiMessage> errors)
        => new(false, default, errors, [], new Dictionary<string, object>());
}

public sealed record ApiMessage(string Code, string Message, string? Target = null);
