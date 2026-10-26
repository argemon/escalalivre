namespace EscalaLivre.Domain.Scheduling;

public static class ScheduleExplanation
{
    public static IEnumerable<SolverDecision> Describe(IReadOnlyList<Employee> employees, IReadOnlyList<ShiftAssignment> assignments)
    {
        foreach (ShiftAssignment? assignment in assignments.Take(1000))
        {
            Employee? employee = employees.FirstOrDefault(x => x.Id == assignment.EmployeeId);
            var factors = new List<string>
            {
                $"cobertura minima de {assignment.Role} requerida",
                "respeita disponibilidade e restricoes individuais",
                "mantem descanso minimo e limite semanal"
            };

            if (assignment.Break is not null)
            {
                factors.Add($"intervalo otimizado entre {assignment.Break.Start:HH\\hmm} e {assignment.Break.End:HH\\hmm}");
            }

            yield return new SolverDecision(
                assignment.Id,
                assignment.EmployeeId,
                $"{employee?.Name ?? assignment.EmployeeId.ToString()} alocado para proteger a cobertura operacional de {assignment.Role}.",
                factors);
        }
    }

}
