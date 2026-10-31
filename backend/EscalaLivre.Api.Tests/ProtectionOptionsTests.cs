using EscalaLivre.Api;

namespace EscalaLivre.Api.Tests;

public sealed class ProtectionOptionsTests
{
    [Fact]
    public void DefaultsAllowSixtyClientsPollingEveryThreeSecondsBehindOneIp()
    {
        var options = new ProtectionOptions();
        options.Validate();
        Assert.Equal(1200, options.JobPollsPerMinute);
        Assert.Equal(60, options.JobCancellationsPerMinute);
    }

    [Theory]
    [InlineData(0, 60)]
    [InlineData(10001, 60)]
    [InlineData(1200, 0)]
    [InlineData(1200, 10001)]
    public void RejectsInvalidJobQuotas(int polls, int cancellations) =>
        Assert.Throws<InvalidOperationException>(() => new ProtectionOptions
        { JobPollsPerMinute = polls, JobCancellationsPerMinute = cancellations }.Validate());

    [Theory]
    [InlineData(1, 10000)]
    [InlineData(10000, 1)]
    public void AcceptsJobQuotaBoundaries(int polls, int cancellations) =>
        new ProtectionOptions { JobPollsPerMinute = polls, JobCancellationsPerMinute = cancellations }.Validate();

    [Theory]
    [InlineData(3, 1024)]
    [InlineData(513, 1024)]
    [InlineData(128, 31)]
    [InlineData(128, 10001)]
    public void RejectsInvalidRetentionBudgets(int payloadMb, int tickets) =>
        Assert.Throws<InvalidOperationException>(() => new ProtectionOptions
        {JobPayloadBudgetMb=payloadMb, JobRetentionLimit=tickets}.Validate());

    [Theory]
    [InlineData(4, 32)]
    [InlineData(512, 10000)]
    public void AcceptsRetentionBudgetBoundaries(int payloadMb, int tickets) =>
        new ProtectionOptions {JobPayloadBudgetMb=payloadMb, JobRetentionLimit=tickets}.Validate();
}
