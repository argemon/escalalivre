namespace EscalaLivre.Domain.Planning;

// Classes (not structs): default(T) must not manufacture an invalid value object.
public sealed record CivilWindow
{
    public DateTime Start { get; }
    public DateTime End { get; }
    public Duration Length => new(End - Start);

    public CivilWindow(DateTime start, DateTime end)
    {
        ValidateCivil(start);
        ValidateCivil(end);
        if (end <= start) throw new ArgumentException("A window must end after it starts.");
        Start = start;
        End = end;
    }

    private static void ValidateCivil(DateTime value)
    {
        if (value.Kind != DateTimeKind.Unspecified || value.Ticks % TimeSpan.TicksPerSecond != 0)
            throw new ArgumentException("Use company civil time with second precision, without an offset.");
    }

    public bool Contains(CivilWindow other) => other.Start >= Start && other.End <= End;
    public bool Overlaps(CivilWindow other) => Start < other.End && other.Start < End;
    public CivilWindow MoveBy(TimeSpan offset) => new(Start.Add(offset), End.Add(offset));
}

public sealed record ShiftPause
{
    public CivilWindow Window { get; }
    public Duration Length => Window.Length;
    public ShiftPause(CivilWindow window) => Window = window ?? throw new ArgumentNullException(nameof(window));
}

public sealed record CivilPlanningPeriod
{
    public DateOnly Start { get; }
    public DateOnly End { get; }
    public DayCount Days => new(End.DayNumber - Start.DayNumber + 1);

    public CivilPlanningPeriod(DateOnly start, DateOnly end)
    {
        if (start.Year < 1900 || end.Year > 2100 || end < start || end.DayNumber - start.DayNumber >= 31)
            throw new ArgumentException("A planning period contains 1 to 31 inclusive dates between 1900 and 2100.");
        Start = start;
        End = end;
    }

    public bool ContainsStart(CivilWindow window)
    {
        var date = DateOnly.FromDateTime(window.Start);
        return date >= Start && date <= End;
    }
}

public sealed record Duration
{
    public TimeSpan Value { get; }
    public Duration(TimeSpan value)
    {
        if (value < TimeSpan.Zero || value.Ticks % TimeSpan.TicksPerSecond != 0)
            throw new ArgumentOutOfRangeException(nameof(value), "Duration must be nonnegative, in whole seconds.");
        Value = value;
    }
}

public sealed record DayCount
{
    public int Value { get; }
    public DayCount(int value)
    {
        if (value < 0) throw new ArgumentOutOfRangeException(nameof(value));
        Value = value;
    }
}

public sealed record WholeHours
{
    public int Value { get; }
    public WholeHours(int value)
    {
        if (value < 0) throw new ArgumentOutOfRangeException(nameof(value));
        Value = value;
    }
}

public sealed record WeeklyHours
{
    public double Value { get; }
    public WeeklyHours(double value)
    {
        if (!double.IsFinite(value) || value <= 0) throw new ArgumentOutOfRangeException(nameof(value));
        Value = value;
    }
}
