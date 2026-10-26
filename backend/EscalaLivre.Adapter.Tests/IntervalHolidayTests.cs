using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Infrastructure.Solver;
namespace EscalaLivre.Adapter.Tests;
public class IntervalHolidayTests {
 private static ScheduleRequest Request(double hours,DateTime? date=null,MiddayClosure? closure=null) {
        DateTime day =date ?? new DateTime(2026,10,14);
  var work=new WorkloadRule("dayBased",5,2,44,TimeSpan.FromHours(hours));
  var company=new CompanyRules("Loja",new(7,30),new(18,0),[day.DayOfWeek],work,new(TimeSpan.Zero,TimeSpan.Zero,TimeSpan.FromHours(3)),TimeSpan.FromHours(11),[new("Staff",day.DayOfWeek,new(7,30),new(8,30),1)],closure);
  var employee=new Employee(Guid.NewGuid(),"Alex","Staff",true,work,[],[],[],false,false,[],ShiftStartsAt:new(7,30));
  return new(new("1.0.0",Guid.NewGuid(),company,[employee],[],DateTimeOffset.UtcNow),day,day.AddDays(1).AddSeconds(-1));
 }
 [Theory]
 [InlineData(4,0)] [InlineData(4.25,15)] [InlineData(6,15)] [InlineData(6.25,60)] [InlineData(8,60)]
 public void AppliesLegalBoundariesAndAddsIntervalToExit(double hours,int pause) {
        ShiftAssignment a =Assert.Single(AdapterComposition.Generate().Execute(Request(hours)).Assignments);
  Assert.Equal(TimeSpan.FromMinutes(pause),a.Break is null ? TimeSpan.Zero : a.Break.End-a.Break.Start);
  Assert.Equal(TimeSpan.FromHours(hours)+TimeSpan.FromMinutes(pause),a.End-a.Start);
  Assert.True(IntervalPolicy.Valid(a));
 }
 [Fact] public void EightHoursWithClosureEndsAt1630() {
        ShiftAssignment a =Assert.Single(AdapterComposition.Generate().Execute(Request(8,closure:new(new(12,0),new(13,0)))).Assignments);
  Assert.Equal(new TimeSpan(16,30,0),a.End.TimeOfDay);
  Assert.Equal(new TimeSpan(12,0,0),a.Break!.Start.TimeOfDay);
 }
 [Fact] public void ClosureShorterThanRequiredCannotGenerateIllegalShift() {
        ShiftAssignment a =Assert.Single(AdapterComposition.Generate().Execute(Request(8,closure:new(new(12,0),new(12,15)))).Assignments);
  Assert.True(IntervalPolicy.Valid(a));
  Assert.True(a.Break!.Start.TimeOfDay<=new TimeSpan(12,0,0) && a.Break.End.TimeOfDay>=new TimeSpan(12,15,0));
 }
 [Fact] public void NationalHolidayClosedByDefaultCanBeExplicitlyOpened() {
        ScheduleRequest r =Request(8,new(2026,10,12));var generation = AdapterComposition.Generate(); ScheduleResult closed =generation.Execute(r);
  Assert.Empty(closed.Assignments);Assert.Empty(closed.Coverage);
  r=r with { Document=r.Document with {Company=r.Document.Company with {Holidays=[new(new(2026,10,12),"Nossa Senhora Aparecida",false)]}}};
  Assert.NotEmpty(generation.Execute(r).Assignments);
 }
 [Fact] public void LocalHolidayClosesAndOpeningOverrideDoesNotHideDate() {
        ScheduleRequest r =Request(8);r=r with {Document=r.Document with {Company=r.Document.Company with {Holidays=[new(new(2026,10,14),"Feriado municipal")]}}};
  Assert.Empty(AdapterComposition.Generate().Execute(r).Assignments);
 }
 [Theory] [InlineData(4,0,true)] [InlineData(5,0,false)] [InlineData(6,15,true)] [InlineData(8,15,false)] [InlineData(8,60,true)]
 public void ValidatorUsesWorkedHours(double work,int pause,bool valid) {
  var start=new DateTime(2026,10,14,7,30,0);var a=new ShiftAssignment(Guid.NewGuid(),Guid.NewGuid(),"Staff",start,start.AddHours(work).AddMinutes(pause),pause==0 ? null : new(start.AddHours(2),start.AddHours(2).AddMinutes(pause)),"manual",[]);
  Assert.Equal(valid,IntervalPolicy.Valid(a));
 }

 [Fact] public void ExplicitHolidayShiftIsPreservedWithoutOpeningCompany() {
        ScheduleRequest r =Request(4,new(2026,10,12)); Employee employee =r.Document.Employees[0];
  var shift=new ShiftAssignment(Guid.NewGuid(),employee.Id,employee.Role,r.Start.AddHours(8),r.Start.AddHours(12),null,"manual",["holiday:2026-10-12"]);
  r=r with {Document=r.Document with {Company=r.Document.Company with {OperatingDays=[]},Assignments=[shift]}};
  var generation = AdapterComposition.Generate(); ScheduleResult result =generation.Execute(r);
  Assert.Equal(shift.Id,Assert.Single(result.Assignments).Id);Assert.Empty(result.Coverage);
  Assert.DoesNotContain(result.Conflicts,c=>c.Code=="holiday" || c.Code=="workingDay");
        ShiftAssignment unauthorized =shift with {Tags=[]}; ScheduleResult invalid =PureComposition.Validate().Execute(r with {Document=r.Document with {Assignments=[unauthorized]}});
  Assert.Contains(invalid.Conflicts,c=>c.Code=="holiday");
  Assert.False(LaborRules.AuthorizedHolidayShift(r.Document.Company,shift with {Start=shift.Start.AddDays(1),End=shift.End.AddDays(1)}));
 }
 [Fact] public void HolidayShiftAvailabilityAndRestAreStillValidated() {
        ScheduleRequest r =Request(4,new(2026,10,12)); Employee e =r.Document.Employees[0];
  var shift=new ShiftAssignment(Guid.NewGuid(),e.Id,e.Role,r.Start.AddHours(8),r.Start.AddHours(12),null,"manual",["holiday:2026-10-12"]);
  r=r with {Document=r.Document with {Employees=[e with {Restrictions=[new(shift.Start,shift.End)]}],Assignments=[shift]}};
  Assert.Contains(PureComposition.Validate().Execute(r).Conflicts,c=>c.Code=="availability");
 }
}
