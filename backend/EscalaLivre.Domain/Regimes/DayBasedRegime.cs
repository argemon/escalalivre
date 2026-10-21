using EscalaLivre.Domain.Scheduling;
namespace EscalaLivre.Domain.Regimes;
public sealed class DayBasedRegime : IShiftRegime
{
    public string Type=>"dayBased";
    public bool CanWork(DateTime candidateStart,DateTime candidateEnd,IReadOnlyList<ShiftAssignment> existingAssignments,WorkloadRule rule,BreakWindow? candidateBreak=null)
    {
        if(candidateEnd<=candidateStart)return false;
        int cycle=Math.Max(1,rule.WorkUnits+rule.RestUnits);
        for(var last=candidateStart.Date;last<candidateStart.Date.AddDays(cycle);last=last.AddDays(1))
        {
            var first=last.AddDays(1-cycle);
            if(existingAssignments.Where(a=>a.Start.Date>=first&&a.Start.Date<=last).Select(a=>a.Start.Date).Append(candidateStart.Date).Distinct().Count()>rule.WorkUnits)return false;
        }
        return true;
    }
    public DateTime GetNextEligibleStart(DateTime lastShiftEnd,WorkloadRule rule)=>lastShiftEnd.Date.AddDays(Math.Max(1,rule.RestUnits)).Add(lastShiftEnd.TimeOfDay);
}
