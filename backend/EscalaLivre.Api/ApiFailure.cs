using EscalaLivre.Application.Contracts;

namespace EscalaLivre.Api;

public sealed class ApiFailure(int status, string code, string message) : Exception(message)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
    public static ApiEnvelope<object> Envelope(string code, string message) => ApiEnvelope<object>.Fail([new(code, message)]);
}
