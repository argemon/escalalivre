namespace EscalaLivre.Api;

public sealed class ProtectionOptions
{
    public int RequestsPerMinute { get; set; } = 60;
    public int SolvesPerMinute { get; set; } = 6;
    public int ConcurrentRequests { get; set; } = 8;
    public int ConcurrentWorkers { get; set; } = 1;
    public int JobQueueLimit { get; set; } = 20;
    public int QueueLimit { get; set; } = 2;
    public int QueueWaitSeconds { get; set; } = 3;
    public int WorkerTimeoutSeconds { get; set; } = 12;
    public int WorkerMemoryMb { get; set; } = 512;
    public string[] AllowedOrigins { get; set; } = [];

    public void Validate()
    {
        if (RequestsPerMinute is < 1 or > 10000 || SolvesPerMinute is < 1 or > 1000
            || ConcurrentRequests is < 1 or > 128 || ConcurrentWorkers is < 1 or > 8
            || JobQueueLimit is < 1 or > 20 || QueueLimit is < 0 or > 32 || QueueWaitSeconds is < 1 or > 10
            || WorkerTimeoutSeconds is < 1 or > 60 || WorkerMemoryMb is < 64 or > 4096
            || AllowedOrigins.Any(o => !Uri.TryCreate(o, UriKind.Absolute, out var uri)
                || uri.Scheme is not ("http" or "https") || uri.AbsolutePath != "/" || o.EndsWith('/') || !string.IsNullOrEmpty(uri.Query) || !string.IsNullOrEmpty(uri.Fragment)))
            throw new InvalidOperationException("Configuração de proteção inválida.");
    }
}
