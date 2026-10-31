using System.Text.Json;
using EscalaLivre.Application.Contracts;

namespace EscalaLivre.Api;

// Bounds retained UTF-8 payloads, not the managed graphs created during execution/HTTP.
internal static class JobPayload
{
    internal const int MaximumBytes = 4 * 1024 * 1024;
    private static readonly JsonSerializerOptions JsonOptions = ScheduleJson.CreateOptions();

    internal static byte[] Serialize<T>(T value)
    {
        using var stream = new LimitedStream();
        JsonSerializer.Serialize(stream, value, JsonOptions);
        return stream.ToArray();
    }

    internal static T Deserialize<T>(byte[] payload) => JsonSerializer.Deserialize<T>(payload, JsonOptions)!;

    private sealed class LimitedStream : MemoryStream
    {
        private void Check(int count)
        {
            if (Length + count > MaximumBytes)
                throw new ApiFailure(422, "resultLimit", "O pedido ou resultado é muito grande. Reduza o período ou a equipe.");
        }

        public override void Write(byte[] buffer, int offset, int count)
        { Check(count); base.Write(buffer, offset, count); }

        public override void Write(ReadOnlySpan<byte> buffer)
        { Check(buffer.Length); base.Write(buffer); }
    }
}
