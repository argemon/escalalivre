using EscalaLivre.Domain.Planning;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Analysis.Tests;

public sealed class PlanningValueTests
{
    private static readonly DateTime Start = new(2026, 12, 31, 23, 59, 59);

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void WindowsRejectEmptyOrReversedBounds(int seconds)
        => Assert.Throws<ArgumentException>(() => new CivilWindow(Start, Start.AddSeconds(seconds)));

    [Theory]
    [InlineData(DateTimeKind.Utc)]
    [InlineData(DateTimeKind.Local)]
    public void CivilWindowsRejectInstantsRatherThanSilentlyConvertingThem(DateTimeKind kind)
        => Assert.Throws<ArgumentException>(() => new CivilWindow(DateTime.SpecifyKind(Start, kind), Start.AddSeconds(1)));

    [Fact]
    public void WindowsPreserveSecondsAndUseHalfOpenIntersection()
    {
        var first = new CivilWindow(Start, Start.AddSeconds(1));
        var second = new CivilWindow(first.End, first.End.AddSeconds(1));
        Assert.Equal(2027, first.End.Year);
        Assert.Equal(TimeSpan.FromSeconds(1), first.Length.Value);
        Assert.False(first.Overlaps(second));
        Assert.True(new CivilWindow(Start, second.End).Contains(first));
        Assert.Equal(first, new CivilWindow(Start, Start.AddSeconds(1)));
        Assert.Throws<ArgumentException>(() => new CivilWindow(Start.AddTicks(1), Start.AddSeconds(1)));
        Assert.Throws<ArgumentNullException>(() => new ShiftPause(null!));
    }

    [Theory]
    [InlineData(24)]
    [InlineData(36)]
    [InlineData(100)]
    public void DurationIsNotATimeOfDay(int hours)
        => Assert.Equal(TimeSpan.FromHours(hours), new Duration(TimeSpan.FromHours(hours)).Value);

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(double.NaN)]
    [InlineData(double.PositiveInfinity)]
    public void WeeklyHoursMustBeFiniteAndPositive(double value)
        => Assert.Throws<ArgumentOutOfRangeException>(() => new WeeklyHours(value));

    [Fact]
    public void UnitsAndRegimesCannotRepresentInvalidConstruction()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => new DayCount(-1));
        Assert.Throws<ArgumentOutOfRangeException>(() => new WholeHours(-1));
        Assert.Throws<ArgumentOutOfRangeException>(() => new Duration(TimeSpan.FromSeconds(-1)));
        Assert.Throws<ArgumentOutOfRangeException>(() => new Duration(TimeSpan.FromTicks(1)));
        Assert.Throws<ArgumentException>(() => new DayCycleConfiguration(new(0), new(1), new(44), new(TimeSpan.FromHours(8))));
        Assert.Throws<ArgumentException>(() => new DayCycleConfiguration(new(int.MaxValue), new(1), new(44), new(TimeSpan.FromHours(8))));
        Assert.Throws<ArgumentException>(() => new HourCycleConfiguration(new(0), new(1), new(44), new(TimeSpan.FromHours(8))));
        Assert.Throws<ArgumentException>(() => new HourCycleConfiguration(new(8), new(0), new(44), new(TimeSpan.Zero)));
        Assert.Throws<ArgumentException>(() => RegimeConfiguration.From(new("unknown", 1, 1, 44, TimeSpan.FromHours(1))));
        var hours = Assert.IsType<HourCycleConfiguration>(RegimeConfiguration.From(new("hourBased", 24, 36, 43.75, TimeSpan.FromHours(24))));
        Assert.Equal(36, hours.RestHours.Value);
        Assert.Equal(43.75, hours.WeeklyLimit.Value);
        Assert.Equal(TimeSpan.FromHours(24), hours.DefaultShiftDuration.Value);
        var days = Assert.IsType<DayCycleConfiguration>(RegimeConfiguration.From(new("dayBased", 5, 2, 44, TimeSpan.FromHours(8))));
        Assert.Equal(7, days.CycleDays.Value);
    }

    [Theory]
    [InlineData(0, true)]
    [InlineData(30, true)]
    [InlineData(31, false)]
    [InlineData(-1, false)]
    public void PlanningDatesAreInclusiveAndBounded(int offset, bool allowed)
    {
        var start = new DateOnly(2026, 10, 1);
        if (!allowed) { Assert.Throws<ArgumentException>(() => new CivilPlanningPeriod(start, start.AddDays(offset))); return; }
        var period = new CivilPlanningPeriod(start, start.AddDays(offset));
        Assert.Equal(offset + 1, period.Days.Value);
        Assert.True(period.ContainsStart(new(period.End.ToDateTime(new(23,59,59)), period.End.AddDays(1).ToDateTime(new(1,0)))));
        Assert.False(period.ContainsStart(new(start.AddDays(-1).ToDateTime(new(23,0)), start.ToDateTime(new(1,0)))));
    }

    [Fact]
    public void PeriodsRejectUnsupportedYears()
    {
        Assert.Throws<ArgumentException>(() => new CivilPlanningPeriod(new(1899,12,31), new(1900,1,1)));
        Assert.Throws<ArgumentException>(() => new CivilPlanningPeriod(new(2100,12,31), new(2101,1,1)));
    }

    [Fact]
    public void NewValuesHaveNoPublicSettersOrInitEscapeHatches()
    {
        Type[] values = [typeof(CivilWindow), typeof(ShiftPause), typeof(CivilPlanningPeriod), typeof(Duration), typeof(DayCount),
            typeof(WholeHours), typeof(WeeklyHours), typeof(DayCycleLimit), typeof(DayCycleConfiguration), typeof(HourCycleConfiguration), typeof(ScheduledAssignment), typeof(PlanningSettings)];
        foreach (var type in values)
            Assert.DoesNotContain(type.GetProperties(), p => p.SetMethod?.IsPublic == true);
        Assert.Null(typeof(PlanningSchedule).GetProperty(nameof(PlanningSchedule.Id))!.SetMethod);
        Assert.Null(typeof(PlanningSchedule).GetProperty(nameof(PlanningSchedule.Assignments))!.SetMethod);
    }
}
