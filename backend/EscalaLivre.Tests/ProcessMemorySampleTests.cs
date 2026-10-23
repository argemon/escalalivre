using System.ComponentModel;
using EscalaLivre.Api;

namespace EscalaLivre.Tests;

public sealed class ProcessMemorySampleTests
{
    [Fact]
    public void ChildExitingDuringMemoryReadDoesNotDiscardItsResult()
    {
        var exited = false;
        var sample = ProcessMemorySample.Read(() =>
        {
            exited = true;
            throw new InvalidOperationException("Process exited between checks");
        }, () => exited);
        Assert.Null(sample);
    }

    [Fact]
    public void NativeSamplingErrorIsIgnoredOnlyAfterConfirmedExit()
    {
        Assert.Null(ProcessMemorySample.Read(() => throw new Win32Exception(3), () => true));
        Assert.Throws<Win32Exception>(() => ProcessMemorySample.Read(() => throw new Win32Exception(5), () => false));
    }

    [Fact]
    public void RunningProcessKeepsItsMemorySampleAndUnexpectedFailures()
    {
        Assert.Equal(600L * 1024 * 1024, ProcessMemorySample.Read(() => 600L * 1024 * 1024, () => false));
        Assert.Throws<InvalidOperationException>(() => ProcessMemorySample.Read(() => throw new InvalidOperationException(), () => false));
        Assert.Throws<IOException>(() => ProcessMemorySample.Read(() => throw new IOException(), () => true));
    }
}
