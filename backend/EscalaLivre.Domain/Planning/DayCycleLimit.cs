namespace EscalaLivre.Domain.Planning;

// One constraint family can be reused by a regime without retaining a reference to that regime.
public sealed record DayCycleLimit
{
    public DayCount WorkDays { get; }
    public DayCount RestDays { get; }
    public DayCount CycleDays => new(checked(WorkDays.Value + RestDays.Value));

    public DayCycleLimit(DayCount workDays, DayCount restDays)
    {
        WorkDays = workDays ?? throw new ArgumentNullException(nameof(workDays));
        RestDays = restDays ?? throw new ArgumentNullException(nameof(restDays));
        if (workDays.Value == 0 || (long)workDays.Value + restDays.Value > int.MaxValue)
            throw new ArgumentException("A cycle needs positive work days and a representable total.");
    }
}
