namespace EscalaLivre.Domain.Scheduling;

// Classifies canonical errors; does not invent a second evaluator or treat coverage gaps as invalidity.
public static class GenerationConformance
{
    public static bool SameAssignment(ShiftAssignment a, ShiftAssignment b)
        => a.Id == b.Id && a.EmployeeId == b.EmployeeId && a.Role == b.Role && a.RoleId == b.RoleId
            && a.Start.ToBinary() == b.Start.ToBinary() && a.End.ToBinary() == b.End.ToBinary()
            && (a.Break is null ? b.Break is null : b.Break is not null
                && a.Break.Start.ToBinary() == b.Break.Start.ToBinary() && a.Break.End.ToBinary() == b.Break.End.ToBinary())
            && a.Source == b.Source && a.Tags.SequenceEqual(b.Tags);

    public static IReadOnlyList<ScheduleIssue> NewErrors(EscalaLivreDocument original,
        IReadOnlyList<ShiftAssignment> proposed, IReadOnlyList<ScheduleIssue> evaluatedIssues)
    {
        var originals = original.Assignments.ToDictionary(a => a.Id);
        var retained = proposed.Where(a => originals.TryGetValue(a.Id, out var old) && SameAssignment(old, a)).ToArray();
        var changed = proposed.Where(a => !originals.TryGetValue(a.Id, out var old) || !SameAssignment(old, a)).ToArray();
        var inherited = ScheduleRules.Diagnose(original, retained).Where(i => i.Severity == "error")
            .GroupBy(i => i).ToDictionary(g => g.Key, g => g.Count());
        var introduced = new List<ScheduleIssue>();
        foreach (var issue in evaluatedIssues.Where(i => i.Severity == "error"))
        {
            bool existed = inherited.TryGetValue(issue, out var count) && count > 0;
            if (existed) inherited[issue]--;
            if (!existed || changed.Any(a => Participates(original, retained, a, issue))) introduced.Add(issue);
        }
        return introduced;
    }

    private static bool Participates(EscalaLivreDocument document, IReadOnlyList<ShiftAssignment> retained,
        ShiftAssignment added, ScheduleIssue issue)
    {
        if (issue.EmployeeId is {} owner && owner != added.EmployeeId) return false;
        if (issue.Start is not {} start || issue.End is not {} end) return true;
        var employee = document.Employees.FirstOrDefault(e => e.Id == added.EmployeeId);
        if (employee is null) return true;
        var rule = EffectiveWorkPolicy.RuleFor(document.Company, employee);
        return issue.Code switch
        {
            "weeklyLimit" => EffectiveWorkPolicy.WorkTicksInWeek(added, start) > 0,
            "dailyLimit" or "multipleShifts" => added.Start.Date == start.Date,
            "regime" when rule.RegimeType == "dayBased" => added.Start.Date >= start.Date.AddDays(1 - DayCyclePolicy.Length(rule))
                && added.Start.Date <= start.Date && !retained.Any(a => a.EmployeeId == added.EmployeeId && a.Start.Date == added.Start.Date),
            "minimumRest" => added.Start <= start && RestPolicy.Conflicts(added.Start, added.End, start, end, RestPolicy.Required(document.Company, rule)),
            "invalidShift" or "availability" or "workingDay" or "outsideHours" or "holiday" or "nightWork"
                or "fixedStart" or "workload" or "regime" or "interval" or "fixedInterval" or "middayClosure"
                or "unknownEmployee" => added.Start == start && added.End == end,
            _ => true // A new diagnostic family needs an explicit participation contract before allowing additions.
        };
    }
}
