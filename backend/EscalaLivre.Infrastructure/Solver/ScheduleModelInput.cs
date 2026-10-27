using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Scheduling;
using EscalaLivre.Domain.Planning;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Infrastructure.Solver;

public sealed class ScheduleModelInput
{
    public ScheduleRequest Request { get; }
    public PlanningSettings Settings { get; }
    public IReadOnlyList<ShiftAssignment> Preserved { get; }
    public ILookup<Guid, ShiftAssignment> History { get; }
    public IReadOnlyList<ShiftAssignment> HolidayShifts { get; }
    public IReadOnlyList<ShiftAssignment> Candidates { get; }
    public IReadOnlyList<ShiftAssignment> FixedCoverage { get; }
    public IReadOnlyList<ShiftAssignment> CoverageCandidates { get; }

    public ScheduleModelInput(ScheduleRequest request, IEnumerable<ShiftAssignment> generated, OptimizationBudget budget)
    {
        Settings = new(request.Document.Company, request.Document.Employees);
        // Translators and objective must read the same frozen configuration that supplies typed units.
        Request = request with { Document = request.Document with { Company = Settings.Company, Employees = Settings.Employees } };
        request = Request;
        Preserved = request.Document.Assignments.Where(a => !ScheduleWindow.Contains(a, request.Start, request.End)).ToList();
        History = Preserved.ToLookup(a => a.EmployeeId);
        HolidayShifts = request.Document.Assignments.Where(a => ScheduleWindow.Contains(a, request.Start, request.End)
            && request.Document.Employees.Any(e => e.Id == a.EmployeeId) && LaborRules.AuthorizedHolidayShift(request.Document.Company, a)).ToList();
        Candidates = generated.Where(a => !HolidayShifts.Any(h => h.EmployeeId == a.EmployeeId && h.Start.Date == a.Start.Date))
            .Take(OptimizationBudget.MaximumCandidates + 1).Concat(HolidayShifts).ToList();
        budget.CheckCandidates(Candidates.Count);
        FixedCoverage = Preserved.Where(a => a.End > request.Start.Date && a.Start < request.End.Date.AddDays(2)).ToList();
        budget.CheckCandidates(Candidates.Count + FixedCoverage.Count);
        CoverageCandidates = Candidates.Concat(FixedCoverage).ToList();
    }
}
