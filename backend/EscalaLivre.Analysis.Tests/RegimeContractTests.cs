using System.Text.Json;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Regimes;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Analysis.Tests;

public sealed class RegimeContractTests
{
    private static readonly JsonSerializerOptions Options = ScheduleJson.CreateOptions();
    private static readonly ShiftRegimeFactory Factory = new([new DayBasedRegime(), new HourBasedRegime()]);

    public static IEnumerable<object[]> Scenarios()
    {
        using var json = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "regime-contract-scenarios.json")));
        return json.RootElement.GetProperty("scenarios").EnumerateArray().Select(s => new object[] { s.GetRawText() }).ToArray();
    }

    [Theory]
    [MemberData(nameof(Scenarios))]
    public void SharedPartialContractsPreserveBoundariesHistoryAndEstimates(string fixture)
    {
        using var json = JsonDocument.Parse(fixture);
        var s = json.RootElement;
        var rule = s.GetProperty("rule").Deserialize<WorkloadRule>(Options)!;
        var candidate = s.GetProperty("candidate").Deserialize<BreakWindow>(Options)!;
        var pause = s.GetProperty("pause").Deserialize<BreakWindow?>(Options);
        var owner = Guid.NewGuid();
        var history = s.GetProperty("history").EnumerateArray().Select(w => {
            var window = w.Deserialize<BreakWindow>(Options)!;
            return new ShiftAssignment(Guid.NewGuid(), owner, "A", window.Start, window.End, null, "manual", []);
        }).ToArray();
        var before = JsonSerializer.Serialize(history, Options);
        var regime = Factory.Resolve(rule.RegimeType);
        var allowed = s.GetProperty("expectedAllowed").GetBoolean();
        Assert.Equal(allowed, regime.CanWork(candidate.Start, candidate.End, history, rule, pause));
        Assert.Equal(allowed, regime.CanWork(candidate.Start, candidate.End, history.Reverse().ToArray(), rule, pause));
        Assert.Equal(allowed, regime.CanWork(candidate.Start, candidate.End, history.Concat(history).ToArray(), rule, pause));
        Assert.Equal(before, JsonSerializer.Serialize(history, Options));
        Assert.Equal(s.GetProperty("expectedWorkSeconds").GetDouble(), EffectiveWorkPolicy.Measure(candidate.Start, candidate.End, pause).TotalSeconds);
        Assert.Equal(s.GetProperty("expectedEstimate").Deserialize<DateTime>(Options), regime.EstimateStartAfterRest(candidate.End, rule));
    }

    [Theory]
    [InlineData("dayBased", 7, 0)]
    [InlineData("hourBased", 8, 11)]
    public void CommonContractRejectsNonpositiveWindowAndKeepsCivilSeconds(string type, int work, int rest)
    {
        var regime = Factory.Resolve(type);
        var rule = new WorkloadRule(type, work, rest, 44, TimeSpan.FromHours(8));
        var start = new DateTime(2026, 10, 19, 8, 0, 1);
        Assert.False(regime.CanWork(start, start, [], rule));
        Assert.False(regime.CanWork(start, start.AddSeconds(-1), [], rule));
        Assert.True(regime.CanWork(start, start.AddSeconds(1), [], rule));
        var estimate = regime.EstimateStartAfterRest(start, rule);
        Assert.Equal(DateTimeKind.Unspecified, estimate.Kind);
        Assert.Equal(1, estimate.Second);
    }

    [Fact]
    public void LocalEstimateIsNotAnEligibilityGuarantee()
    {
        var regime = Factory.Resolve("dayBased");
        var rule = new WorkloadRule("dayBased", 1, 1, 44, TimeSpan.FromHours(2));
        var estimated = regime.EstimateStartAfterRest(new(2026, 10, 19, 10, 0, 0), rule);
        var future = new ShiftAssignment(Guid.NewGuid(), Guid.NewGuid(), "A", estimated.AddDays(1), estimated.AddDays(1).AddHours(2), null, "manual", []);
        Assert.False(regime.CanWork(estimated, estimated.AddHours(2), [future], rule));
    }

    [Fact]
    public void ResolverSupportsRegistrationWithoutConcreteTypeKnowledgeAndSnapshotsTheRegistry()
    {
        var custom = new RegisteredRegime("custom");
        var registrations = new List<IShiftRegime> { custom };
        var factory = new ShiftRegimeFactory(registrations);
        registrations.Clear();
        Assert.Same(custom, factory.Resolve("CUSTOM"));
        IShiftRegime consumer = factory.Resolve("custom");
        Assert.True(consumer.CanWork(new(2026, 10, 19), new(2026, 10, 20), [], new("custom", 1, 0, 44, TimeSpan.FromHours(1))));
    }

    [Fact]
    public void UnknownAndInvalidTypesHaveExplicitFailures()
    {
        Assert.Equal("Regime 'missing' is not supported.", Assert.Throws<InvalidOperationException>(() => Factory.Resolve("missing")).Message);
        Assert.Throws<InvalidOperationException>(() => new ShiftRegimeFactory([]).Resolve("dayBased"));
        Assert.Throws<ArgumentNullException>(() => Factory.Resolve(null!));
        Assert.Throws<ArgumentException>(() => Factory.Resolve(" "));
        Assert.Throws<ArgumentNullException>(() => new ShiftRegimeFactory(null!));
        Assert.Throws<ArgumentException>(() => new ShiftRegimeFactory([null!]));
        Assert.Throws<ArgumentException>(() => new ShiftRegimeFactory([new RegisteredRegime(" ")]));
    }

    [Theory]
    [InlineData("dayBased")]
    [InlineData("DAYBASED")]
    public void DuplicateRegistrationsFailRatherThanSilentlySelectAStrategy(string duplicate)
        => Assert.Throws<ArgumentException>(() => new ShiftRegimeFactory([new DayBasedRegime(), new RegisteredRegime(duplicate)]));

    private sealed class RegisteredRegime(string type) : IShiftRegime
    {
        public string Type => type;
        public bool CanWork(DateTime start, DateTime end, IReadOnlyList<ShiftAssignment> history, WorkloadRule rule, BreakWindow? pause = null) => end > start;
        public DateTime EstimateStartAfterRest(DateTime end, WorkloadRule rule) => end;
    }
}
