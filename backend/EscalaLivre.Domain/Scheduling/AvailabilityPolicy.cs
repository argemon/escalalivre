namespace EscalaLivre.Domain.Scheduling;

public static class AvailabilityPolicy
{
    // One window must contain the entire shift; restrictions also block its pause.
    public static bool Allows(Employee e,DateTime start,DateTime end)
        =>!e.Restrictions.Any(w=>w.Start<end&&start<w.End)&&(e.Availability.Count==0||e.Availability.Any(w=>w.Start<=start&&w.End>=end));
}
