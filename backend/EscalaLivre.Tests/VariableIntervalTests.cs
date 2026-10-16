using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Infrastructure.Solver;
namespace EscalaLivre.Tests;
public class VariableIntervalTests {
 private static ScheduleRequest Request(MiddayClosure? closure=null,MiddayClosure? fixedInterval=null,int employees=1) {
  var work=new WorkloadRule("dayBased",5,2,44,TimeSpan.FromHours(8));
  var company=new CompanyRules("Loja",new(7,30),new(17,30),[DayOfWeek.Wednesday],work,new(TimeSpan.FromHours(1),TimeSpan.FromHours(2),TimeSpan.FromHours(4)),TimeSpan.FromHours(11),[new("Staff",DayOfWeek.Wednesday,new(7,30),new(17,30),1)],closure);
        Employee[] people =Enumerable.Range(0,employees).Select(i=>new Employee(Guid.NewGuid(),"Pessoa "+i,"Staff",true,work,[],[],[],false,false,[],ShiftStartsAt:new(7,30),FixedInterval:fixedInterval)).ToArray();
  return new(new("1.0.0",Guid.NewGuid(),company,people,[],DateTimeOffset.UtcNow),new(2026,10,14),new(2026,10,14,23,59,59));
 }
 [Fact] public void TwoHourIntervalCoversFullDayWhenCompanyClosesForTwoHours() {
        ScheduleResult result =new OrToolsScheduleSolver().Solve(Request(new(new(12,0),new(14,0))));
        ShiftAssignment a =Assert.Single(result.Assignments);Assert.Empty(result.Gaps);Assert.Empty(result.Conflicts);
  Assert.Equal(new TimeSpan(17,30,0),a.End.TimeOfDay);Assert.Equal(TimeSpan.FromHours(2),a.Break!.End-a.Break.Start);
 }
 [Fact] public void LongerIntervalCanCoverClosingWithoutHidingRemainingGap() {
        ScheduleResult result =new OrToolsScheduleSolver().Solve(Request(new(new(12,0),new(13,0))));
        ShiftAssignment a =Assert.Single(result.Assignments);Assert.Equal(new TimeSpan(17,30,0),a.End.TimeOfDay);
  Assert.Equal(TimeSpan.FromHours(2),a.Break!.End-a.Break.Start);Assert.NotEmpty(result.Gaps);
  Assert.DoesNotContain(result.Gaps,g=>g.End.TimeOfDay==new TimeSpan(17,30,0));
 }
 [Fact] public void TwoEmployeesStaggerExtendedBreaksAndCoverWholeDay() {
        ScheduleResult result =new OrToolsScheduleSolver().Solve(Request(new(new(12,0),new(13,0)),employees:2));
  Assert.Equal(2,result.Assignments.Count);Assert.Empty(result.Gaps);Assert.Empty(result.Conflicts);
 }
 [Fact] public void FixedIntervalOverridesAutomaticChoices() {
        ScheduleResult result =new OrToolsScheduleSolver().Solve(Request(new(new(12,0),new(13,0)),new(new(11,30),new(13,0))));
        ShiftAssignment a =Assert.Single(result.Assignments);Assert.Equal(new TimeSpan(11,30,0),a.Break!.Start.TimeOfDay);
  Assert.Equal(new TimeSpan(13,0,0),a.Break.End.TimeOfDay);Assert.Equal(new TimeSpan(17,0,0),a.End.TimeOfDay);
 }
 [Fact] public void FixedIntervalOutsideShiftCannotGenerateInvalidBreak() {
  Assert.Empty(new OrToolsScheduleSolver().Solve(Request(fixedInterval:new(new(19,0),new(20,0)))).Assignments);
 }
 [Fact] public void IncompatibleFixedIntervalCannotWorkDuringCompanyClosure() {
  Assert.Empty(new OrToolsScheduleSolver().Solve(Request(new(new(12,0),new(13,0)),new(new(14,0),new(15,0)))).Assignments);
 }
 [Fact] public void MaximumOfOneHourIsRespected() {
        ScheduleRequest r =Request(new(new(12,0),new(13,0)));r=r with {Document=r.Document with {Company=r.Document.Company with {Lunch=r.Document.Company.Lunch with {Maximum=TimeSpan.FromHours(1)}}}};
        ShiftAssignment a =Assert.Single(new OrToolsScheduleSolver().Solve(r).Assignments);Assert.Equal(TimeSpan.FromHours(1),a.Break!.End-a.Break.Start);
  Assert.Equal(new TimeSpan(16,30,0),a.End.TimeOfDay);
 }
}
