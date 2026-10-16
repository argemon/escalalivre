using EscalaLivre.Domain.Regimes;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Tests;

public sealed class RegimeTests
{
    [Fact]
    public void HourBasedRegimeRequiresConfiguredRestHours()
    {
        var regime = new HourBasedRegime();
        var previous = new ShiftAssignment(Guid.NewGuid(), Guid.NewGuid(), "atendente", new DateTime(2026, 5, 16, 7, 0, 0), new DateTime(2026, 5, 16, 19, 0, 0), null, "test", []);
        var rule = new WorkloadRule("hourBased", 12, 36, 44, TimeSpan.FromHours(12));

        bool canWork = regime.CanWork(new DateTime(2026, 5, 17, 7, 0, 0), new DateTime(2026, 5, 17, 19, 0, 0), [previous], rule);

        Assert.False(canWork);
    }

    [Fact]
    public void FactoryResolvesDayAndHourBasedRegimes()
    {
        var factory = new ShiftRegimeFactory();

        Assert.IsType<DayBasedRegime>(factory.Resolve("dayBased"));
        Assert.IsType<HourBasedRegime>(factory.Resolve("hourBased"));
    }
}
