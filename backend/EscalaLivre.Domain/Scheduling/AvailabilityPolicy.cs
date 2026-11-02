namespace EscalaLivre.Domain.Scheduling;

public static class AvailabilityPolicy
{
    public static IEnumerable<(DateTime Start,DateTime End)> GenerationWindows(Employee employee, DateTime start, DateTime end)
    {
        var allowed = employee.Availability.Count == 0 ? new[] { new AvailabilityWindow(start,end) } : employee.Availability;
        foreach (var window in allowed)
        {
            var segments = new List<(DateTime Start,DateTime End)> { (window.Start > start ? window.Start : start, window.End < end ? window.End : end) };
            foreach (var block in employee.Restrictions)
                segments = segments.SelectMany(s => block.End <= s.Start || block.Start >= s.End ? new[] {s}
                    : new[] {(s.Start, block.Start < s.End ? block.Start : s.End),(block.End > s.Start ? block.End : s.Start,s.End)})
                    .Where(s => s.Item2 > s.Item1).ToList();
            foreach (var segment in segments.Where(s=>s.End>s.Start)) yield return segment;
        }
    }
    // One window must contain the entire shift; restrictions also block its pause.
    public static bool Allows(Employee e,DateTime start,DateTime end)
        =>!e.Restrictions.Any(w=>w.Start<end&&start<w.End)&&(e.Availability.Count==0||e.Availability.Any(w=>w.Start<=start&&w.End>=end));
}
