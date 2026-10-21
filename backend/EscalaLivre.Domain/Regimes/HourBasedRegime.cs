using EscalaLivre.Domain.Scheduling;
namespace EscalaLivre.Domain.Regimes;
public sealed class HourBasedRegime : IShiftRegime
{
    public string Type=>"hourBased";
    public bool CanWork(DateTime candidateStart,DateTime candidateEnd,IReadOnlyList<ShiftAssignment> existingAssignments,WorkloadRule rule,BreakWindow? candidateBreak=null)
    {
        var work=candidateEnd-candidateStart-(candidateBreak is null?TimeSpan.Zero:candidateBreak.End-candidateBreak.Start);
        var rest=TimeSpan.FromHours(rule.RestUnits);
        return candidateEnd>candidateStart&&work<=TimeSpan.FromHours(rule.WorkUnits)&&existingAssignments.All(a=>candidateStart>=a.End+rest||a.Start>=candidateEnd+rest);
    }
    public DateTime GetNextEligibleStart(DateTime lastShiftEnd,WorkloadRule rule)=>lastShiftEnd.AddHours(rule.RestUnits);
}
