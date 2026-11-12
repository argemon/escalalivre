namespace EscalaLivre.Domain.Scheduling;

public sealed record ContractMinimum(Guid EmployeeId, DateTime WeekStart, long RequiredSeconds);

// Generation obligation. Drafts with shortfalls remain editable and recoverable.
public static class ContractMinimumPolicy
{
    public static IReadOnlyList<ContractMinimum> Requirements(EscalaLivreDocument document, DateTime start,
        DateTime end, IReadOnlyList<ShiftAssignment> assignments)
    {
        return Summaries(document, start, end, assignments)
            .Select(row => new ContractMinimum(row.Summary.EmployeeId, row.Summary.WeekStart,
                Required(document.Company, row.Employee, row.Summary, start, row.End, assignments)))
            .ToArray();
    }

    public static IReadOnlyList<ScheduleIssue> ConfigurationIssues(EscalaLivreDocument document, DateTime start, DateTime end)
        => document.Employees.Where(e => EmploymentPolicy.ActiveOn(e, start)
            && WeeklyWorkPlanPolicy.For(document.Company,e) is { FlexibleWorkDays: null } plan
            && plan.DailySeconds.Sum() != plan.ContractedSeconds)
            .Select(e => new ScheduleIssue("error", "solverInfeasible",
                $"A distribuição diária de {e.Name} não soma a carga contratada. Ajuste a distribuição antes de gerar.",
                start, end, EmployeeId:e.Id)).ToArray();

    private static IEnumerable<(Employee Employee, WorkloadSummary Summary, DateTime End)> Summaries(
        EscalaLivreDocument document, DateTime start, DateTime end, IReadOnlyList<ShiftAssignment> assignments)
    {
        foreach(var employee in document.Employees)
        {
            var activeEnd = employee.InactiveFrom is {} inactive && inactive.ToDateTime(TimeOnly.MinValue) <= end
                ? inactive.ToDateTime(TimeOnly.MinValue).AddTicks(-1) : end;
            if(activeEnd.Date < start.Date) continue;
            foreach(var summary in ContractWorkPolicy.Summarize(document with {Employees=[employee]},start,activeEnd,assignments) ?? [])
                yield return (employee,summary,activeEnd);
        }
    }

    private static long Required(CompanyRules company, Employee employee, WorkloadSummary summary,
        DateTime start, DateTime end, IReadOnlyList<ShiftAssignment> assignments)
    {
        var plan = WeeklyWorkPlanPolicy.For(company, employee)!;
        if (FiveDay42HoursPolicy.NormalDailySeconds(plan) != 28800) return summary.ExpectedSeconds;

        // The explicit 42h/8h choice alone permits the displayed normal-hour shortfall.
        if (plan.FlexibleWorkDays is null)
            return summary.Days.Sum(d => Math.Min(d.ExpectedSeconds, 28800));

        int slots = FlexibleContractPolicy.SlotsInPeriod(company, employee, summary.WeekStart, start, end, assignments);
        var credits = summary.Days.Select(d => (long)ContractWorkPolicy.Excused(company, employee, d.Date))
            .OrderByDescending(c => c).Take(slots).ToArray();
        return (long)slots * 28800 - credits.Sum(c => 28800 - Math.Min(28800, Math.Max(0, 30240 - c)));
    }

    public static IReadOnlyList<ContractMinimum> Missing(EscalaLivreDocument document, DateTime start,
        DateTime end, IReadOnlyList<ShiftAssignment> assignments)
    {
        return Summaries(document,start,end,assignments)
            .Select(row => new ContractMinimum(row.Employee.Id,row.Summary.WeekStart,Math.Max(0,
                Required(document.Company,row.Employee,row.Summary,start,row.End,assignments)-row.Summary.RecognizedSeconds)))
            .Where(minimum => minimum.RequiredSeconds > 0).ToArray();
    }
}
