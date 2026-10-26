using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Scheduling;
using EscalaLivre.Domain.Scheduling;
using Google.OrTools.Sat;

namespace EscalaLivre.Infrastructure.Solver;

public sealed class FixedAssignmentConstraints : IScheduleConstraintTranslator
{
    public void Apply(ScheduleModelContext context, OptimizationBudget budget)
    {
        var request = context.Input.Request;
        var model = context.Model;
        var holidayShifts = context.Input.HolidayShifts;
        var fixedCoverage = context.Input.FixedCoverage;
        var decisionVars = context.DecisionVars;
        foreach (var shift in holidayShifts.Concat(fixedCoverage)) model.Add(decisionVars[shift.Id] == 1);
        foreach(var shift in holidayShifts)
        {
            var employee=request.Document.Employees.First(e=>e.Id==shift.EmployeeId);
            if(ScheduleRules.ShiftDiagnostics(request.Document.Company,employee,shift).Any(c=>c.Severity=="error"))model.Add(decisionVars[shift.Id]==0);
        }

    }
}
