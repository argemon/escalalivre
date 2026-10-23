using System.ComponentModel;

namespace EscalaLivre.Api;

internal static class ProcessMemorySample
{
    // A child can exit after HasExited/Refresh but before WorkingSet64 reads /proc.
    // Only ignore sampling errors when exit is confirmed; keep live-process failures visible.
    internal static long? Read(Func<long> readMemory, Func<bool> hasExited)
    {
        try { return readMemory(); }
        catch (InvalidOperationException) when (hasExited()) { return null; }
        catch (Win32Exception) when (hasExited()) { return null; }
    }
}
