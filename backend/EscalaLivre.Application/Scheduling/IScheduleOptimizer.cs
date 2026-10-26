using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Application.Scheduling;

public sealed record ScheduleOptimizationResult(
    IReadOnlyList<ShiftAssignment> Assignments,
    IReadOnlyList<ShiftAssignment> SelectedAssignments,
    string Status,
    IReadOnlyList<ScheduleIssue> Issues);

// Selects assignments and reports solver status. Evaluation/response assembly belong to Application.
public interface IScheduleOptimizer
{
    ScheduleOptimizationResult Optimize(ScheduleRequest request);
}
