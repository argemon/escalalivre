// Copied into isolated benchmark snapshots only. Never compiled into production projects.
using System.Diagnostics;
namespace EscalaLivre.Domain.Scheduling;
public static class PerformancePhaseProbe
{
    public sealed record Sample(string Phase,double Milliseconds,long ManagedBytes);
    public static List<Sample> Samples { get; } = [];
    public static void Reset() => Samples.Clear();
    public static IDisposable Measure(string phase) => new Scope(phase);
    private sealed class Scope(string phase) : IDisposable {
        private readonly long allocated=GC.GetTotalAllocatedBytes(false), started=Stopwatch.GetTimestamp();
        public void Dispose() => Samples.Add(new(phase,Stopwatch.GetElapsedTime(started).TotalMilliseconds,GC.GetTotalAllocatedBytes(false)-allocated));
    }
}
