using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Infrastructure.Solver;
namespace EscalaLivre.Tests;
public class DirectionalCoverageTests {
 private static ScheduleRequest Request(bool authorized,bool pharmacistRequiredDuringBreak=false) {
  var work=new WorkloadRule("dayBased",5,2,44,TimeSpan.FromHours(8));
  var coverage=new List<CoverageRequirement>{new("Atendente",DayOfWeek.Wednesday,new(11,0),new(13,0),1)};
  if(pharmacistRequiredDuringBreak)coverage.Add(new("Farmacêutico",DayOfWeek.Wednesday,new(11,0),new(13,0),1));
  var company=new CompanyRules("Farmácia",new(7,30),new(16,30),[DayOfWeek.Wednesday],work,new(TimeSpan.FromHours(1),TimeSpan.FromHours(1),TimeSpan.FromHours(4)),TimeSpan.FromHours(11),coverage);
  var pharma=new Employee(Guid.NewGuid(),"Farmacêutico","Farmacêutico",true,work,[],[],[],false,false,[],ShiftStartsAt:new(7,30),FixedInterval:new(new(11,0),new(12,0)),CoverageRoles:authorized ? ["Atendente"] : []);
  var attendant=new Employee(Guid.NewGuid(),"Atendente","Atendente",true,work,[],[],[],false,false,[],ShiftStartsAt:new(7,30),FixedInterval:new(new(12,0),new(13,0)));
  return new(new("1.0.0",Guid.NewGuid(),company,[pharma,attendant],[],DateTimeOffset.UtcNow),new(2026,10,14),new(2026,10,14,23,59,59));
 }
 [Fact] public void AuthorizedPharmacistCoversAttendantDuringStaggeredIntervals() {
        ScheduleResult result =new OrToolsScheduleSolver().Solve(Request(true));Assert.Empty(result.Gaps);Assert.Empty(result.Conflicts);Assert.Equal(2,result.Assignments.Count);
  Assert.All(result.Assignments,a=>Assert.Equal(TimeSpan.FromHours(1),a.Break!.End-a.Break.Start));
 }
 [Fact] public void SubstitutionIsNeverAutomaticOrBidirectional() {
        ScheduleResult result =new OrToolsScheduleSolver().Solve(Request(false));Assert.Contains(result.Gaps,g=>g.Role=="Atendente" && g.Start.Hour==12);
        ScheduleResult authorized =new OrToolsScheduleSolver().Solve(Request(true,true));Assert.Contains(authorized.Gaps,g=>g.Role=="Farmacêutico" && g.Start.Hour==11);
  Assert.DoesNotContain(authorized.Gaps,g=>g.Role=="Atendente");
 }
 [Fact] public void OnePersonCannotCoverTwoRequiredRolesSimultaneously() {
        ScheduleRequest r =Request(true,true);r=r with {Document=r.Document with {Employees=[r.Document.Employees[0] with {FixedInterval=new(new(13,0),new(14,0))}]}};
        ScheduleResult result =new OrToolsScheduleSolver().Solve(r);Assert.NotEmpty(result.Gaps);Assert.All(result.Coverage.GroupBy(c=>c.Start),g=>Assert.True(g.Sum(b=>b.Assigned)<=1));
 }
 [Fact] public void TeamCoverageLetsDifferentRolesAlternateWithoutSubstitution() {
        ScheduleRequest r =Request(false);r=r with {Document=r.Document with {Company=r.Document.Company with {Coverage=[new("Equipe",DayOfWeek.Wednesday,new(11,0),new(13,0),1,Scope:"team")]}}};
        ScheduleResult result =new OrToolsScheduleSolver().Solve(r);Assert.Empty(result.Gaps);Assert.Equal(2,result.Assignments.Count);
 }
 [Fact] public void AutomaticIntervalsStaggerInsteadOfLeavingNobodyPresent() {
        ScheduleRequest r =Request(true);r=r with {Document=r.Document with {Employees=r.Document.Employees.Select(e=>e with {FixedInterval=null}).ToArray(),Company=r.Document.Company with {Coverage=[new("Farmacêutico",DayOfWeek.Wednesday,new(7,30),new(16,30),1),new("Atendente",DayOfWeek.Wednesday,new(7,30),new(16,30),1)]}}};
        ScheduleResult result =new OrToolsScheduleSolver().Solve(r);Assert.Equal(2,result.Assignments.Count);
        BreakWindow a =result.Assignments[0].Break!; BreakWindow b =result.Assignments[1].Break!;Assert.True(a.End<=b.Start || b.End<=a.Start);
  Assert.NotEmpty(result.Gaps);
 }
}
