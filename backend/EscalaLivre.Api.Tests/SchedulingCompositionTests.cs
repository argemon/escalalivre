using EscalaLivre.Domain.Regimes;
using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Api;
using EscalaLivre.Application.Scheduling;
using EscalaLivre.Infrastructure.Solver;
using Microsoft.Extensions.DependencyInjection;

namespace EscalaLivre.Api.Tests;

public sealed class SchedulingCompositionTests
{
    [Fact]
    public void AnalysisCompositionDoesNotRegisterOrResolveAnOptimizer()
    {
        using var services = new ServiceCollection().AddScheduleAnalysis().BuildServiceProvider(new ServiceProviderOptions { ValidateOnBuild = true });
        Assert.IsType<ScheduleAnalyzer>(services.GetRequiredService<IScheduleAnalyzer>());
        Assert.NotNull(services.GetRequiredService<AnalyzeSchedule>());
        Assert.NotNull(services.GetRequiredService<ValidateSchedule>());
        Assert.Null(services.GetService<IScheduleOptimizer>());
    }

    [Fact]
    public void CompositionRegistersRegimesAndRejectsDuplicateTypesAtResolution()
    {
        var registrations = new ServiceCollection().AddScheduleAnalysis();
        registrations.AddSingleton<IShiftRegime>(new ExtraRegime());
        using var provider = registrations.BuildServiceProvider();
        var factory = provider.GetRequiredService<ShiftRegimeFactory>();
        Assert.IsType<DayBasedRegime>(factory.Resolve("dayBased"));
        Assert.IsType<HourBasedRegime>(factory.Resolve("hourBased"));
        Assert.IsType<ExtraRegime>(factory.Resolve("extra"));
        registrations.AddSingleton<IShiftRegime, DayBasedRegime>();
        using var duplicated = registrations.BuildServiceProvider();
        Assert.Throws<ArgumentException>(() => duplicated.GetRequiredService<ShiftRegimeFactory>());
    }

    private sealed class ExtraRegime : IShiftRegime
    {
        public string Type => "extra";
        public bool CanWork(DateTime start, DateTime end, IReadOnlyList<ShiftAssignment> history, WorkloadRule rule, BreakWindow? pause = null) => end > start;
        public DateTime EstimateStartAfterRest(DateTime end, WorkloadRule rule) => end;
    }

    [Fact]
    public void GenerationCompositionUsesOptimizerCapabilityWithoutLegacyFacade()
    {
        using var services = new ServiceCollection().AddScheduleAnalysis().AddScheduleOptimization().BuildServiceProvider(new ServiceProviderOptions { ValidateOnBuild = true });
        Assert.IsType<OrToolsScheduleOptimizer>(services.GetRequiredService<IScheduleOptimizer>());
        Assert.NotNull(services.GetRequiredService<GenerateSchedule>());
        Assert.Equal(new[] { typeof(FixedAssignmentConstraints), typeof(DailyExclusivityConstraints), typeof(RestConstraints),
            typeof(WeeklyWorkConstraints), typeof(DayCycleConstraints), typeof(CoverageConstraints) },
            services.GetServices<IScheduleConstraintTranslator>().Select(t => t.GetType()));
    }
}
