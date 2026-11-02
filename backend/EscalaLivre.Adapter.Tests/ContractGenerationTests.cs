using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Infrastructure.Solver;

namespace EscalaLivre.Adapter.Tests;

public sealed class ContractGenerationTests
{
    internal static ScheduleRequest Request(bool friday = false, int hours = 44, int people = 2, int pauseMax = 1)
    {
        var plan = friday ? WeeklyWorkPlanPolicy.ReducedFriday(hours*3600,[DayOfWeek.Monday,DayOfWeek.Tuesday,DayOfWeek.Wednesday,DayOfWeek.Thursday,DayOfWeek.Friday],28800,new("Acordo",new(2026,1,1),new(2026,12,31)))
            : WeeklyWorkPlanPolicy.Uniform(hours*3600,[DayOfWeek.Monday,DayOfWeek.Tuesday,DayOfWeek.Wednesday,DayOfWeek.Thursday,DayOfWeek.Friday],new("Acordo",new(2026,1,1),new(2026,12,31)));
        var work = new WorkloadRule("dayBased",5,2,44,TimeSpan.FromHours(8),plan);
        var days=Enumerable.Range(1,5).Select(i=>(DayOfWeek)i).ToArray();
        var company=new CompanyRules("Loja",new(7,30),new(17,30),days,work,new(TimeSpan.FromHours(1),TimeSpan.FromHours(pauseMax),TimeSpan.FromHours(4)),TimeSpan.FromHours(11),days.Select(d=>new CoverageRequirement("Equipe",d,new(7,30),new(17,30),1)).ToArray());
        var employees=Enumerable.Range(0,people).Select(i=>new Employee(Guid.NewGuid(),"Pessoa "+i,"Equipe",true,work,[],[],[],false,false,[],ShiftStartsAt:new(7,30))).ToArray();
        return new(new("1.0.0",Guid.NewGuid(),company,employees,[],new(2026,11,1,0,0,0,TimeSpan.Zero)),new(2026,11,9),new(2026,11,13));
    }
    [Theory]
    [InlineData(false,44,1)]
    [InlineData(true,44,1)]
    [InlineData(false,40,1)]
    [InlineData(false,44,2)]
    public void GeneratesContractRatherThanCeilingWithRegularIntervals(bool friday,int hours,int pauseMax)
    {
        var r=Request(friday,hours,pauseMax:pauseMax);
        var result=AdapterComposition.Generate().Execute(r);
        Assert.Contains(result.Optimization!.Status,new[]{"optimal","feasible"});
        Assert.DoesNotContain(result.Conflicts,c=>c.Severity=="error");
        Assert.NotNull(result.Workloads);
        foreach(var employee in r.Document.Employees)
        {
            var shifts=result.Assignments.Where(a=>a.EmployeeId==employee.Id).ToArray();
            Assert.Equal(5,shifts.Length);
            Assert.Equal(hours,shifts.Sum(a=>EffectiveWorkPolicy.Measure(a).TotalHours),8);
            foreach(var shift in shifts)Assert.Equal(ContractWorkPolicy.Target(r.Document.Company,employee,shift.Start),EffectiveWorkPolicy.Measure(shift).TotalSeconds);
            Assert.Single(shifts.Select(a=>(a.Break!.Start.TimeOfDay,a.Break.End-a.Break.Start)).Distinct());
            Assert.All(shifts,a=>Assert.InRange((a.Break!.End-a.Break.Start).TotalHours,1,pauseMax));
        }
        Assert.All(result.Workloads!,s=>Assert.Equal(0,s.UnmetSeconds));
    }
    [Fact]
    public void UnavailableDayAndHolidayAreNotAutomaticallyMadeUp()
    {
        var r=Request(people:1);
        var employee=r.Document.Employees[0] with {Restrictions=[new(new(2026,11,10),new(2026,11,11))],ContractLeaves=[new(new(2026,11,11),31680)]};
        r=r with {Document=r.Document with {Employees=[employee],Company=r.Document.Company with {Holidays=[new(new(2026,11,12),"Feriado")]}}};
        var result=AdapterComposition.Generate().Execute(r);
        Assert.Contains(result.Optimization!.Status,new[]{"optimal","feasible"});
        var summary=Assert.Single(result.Workloads!);
        Assert.Equal(95040,summary.ExpectedSeconds);Assert.Equal(63360,summary.PlannedSeconds);Assert.Equal(31680,summary.UnmetSeconds);
        Assert.DoesNotContain(result.Assignments,a=>a.Start.Day is 10 or 11 or 12);
        Assert.Contains(result.Conflicts,c=>c.Code=="workloadShortfall"&&c.Severity=="warning");
    }
    [Fact]
    public void PartialPeriodPreservesBothHistoricalEdgesAndSecondPreciseRoutine()
    {
        var r=Request(people:1);var employee=r.Document.Employees[0];
        ShiftAssignment History(int offset) {
            var day=r.Start.AddDays(offset);
            return new(Guid.NewGuid(),employee.Id,employee.Role,day.AddHours(7.5),day.AddHours(17.3),
                new(day.AddHours(12).AddSeconds(1),day.AddHours(13).AddSeconds(1)),"manual",["history"]);
        }
        var before=History(0);var after=History(4);
        r=r with {Start=r.Start.AddDays(1),End=r.End.AddDays(-1),Document=r.Document with {Assignments=[before,after]}};
        var result=AdapterComposition.Generate().Execute(r);
        Assert.Contains(result.Optimization!.Status,new[]{"optimal","feasible"});
        Assert.Contains(result.Assignments,a=>GenerationConformance.SameAssignment(a,before));
        Assert.Contains(result.Assignments,a=>GenerationConformance.SameAssignment(a,after));
        Assert.Equal(95040,Assert.Single(result.Workloads!).PlannedSeconds);
        Assert.Equal(63360,Assert.Single(result.Workloads!).HistoricalWorkSeconds);
        Assert.All(result.Assignments,a=>Assert.Equal(new TimeSpan(12,0,1),a.Break!.Start.TimeOfDay));
    }
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void ObjectivePrioritizesCoverageThenContractBeforePreferences(bool demandAtClosing)
    {
        var r=Request(people:1);r=r with {End=r.Start};
        var company=r.Document.Company with {Lunch=new(TimeSpan.FromHours(1),TimeSpan.FromHours(2),TimeSpan.FromHours(4)),Coverage=demandAtClosing?[new("Equipe",DayOfWeek.Monday,new(17,18),new(17,30),1)]:[]};
        r=r with {Document=r.Document with {Company=company}};
        var employee=r.Document.Employees[0];
        var a=new ShiftAssignment(Guid.NewGuid(),employee.Id,employee.Role,r.Start.AddHours(7.5),r.Start.AddHours(17.3),new(r.Start.AddHours(12),r.Start.AddHours(13)),"solver",[]);
        var b=a with {Id=Guid.NewGuid(),End=r.Start.AddHours(17.5),Break=new(r.Start.AddHours(11.5),r.Start.AddHours(13.5)),Tags=["closing"]};
        var budget=new OptimizationBudget();var context=AdapterComposition.Builder().Build(new(r,[a,b],budget),budget);
        var result=ContractObjectiveSearch.Solve(context,new OrToolsExecution(),new ScheduleResultReader(),5);
        Assert.Contains(result.Status,new[]{"optimal","feasible"});
        Assert.Equal(demandAtClosing?28800:31680,EffectiveWorkPolicy.Measure(Assert.Single(result.SelectedAssignments)).TotalSeconds);
    }
    [Fact]
    public void WeeklyRemainderIsASecondPreciseCandidateWithoutExtendingAnyDay()
    {
        var r=Request(people:1);var employee=r.Document.Employees[0] with {AllowsOvertime=true};
        ShiftAssignment History(int offset) {var day=r.Start.AddDays(offset);return new(Guid.NewGuid(),employee.Id,employee.Role,day.AddHours(7.5),day.AddHours(17.5),new(day.AddHours(12),day.AddHours(13)),"manual",[]);}
        r=r with {Start=r.Start.AddDays(1),End=r.End.AddDays(-1),Document=r.Document with {Employees=[employee],Assignments=[History(0),History(4)]}};
        var result=AdapterComposition.Generate().Execute(r);
        Assert.Contains(result.Optimization!.Status,new[]{"optimal","feasible"});
        var summary=Assert.Single(result.Workloads!);
        Assert.Equal(93600,summary.PlannedSeconds);Assert.Equal(1440,summary.UnmetSeconds);
        Assert.Equal(158400,result.Assignments.Sum(a=>EffectiveWorkPolicy.Measure(a).TotalSeconds));
        Assert.DoesNotContain(result.Conflicts,c=>c.Code=="weeklyLimit");
    }
    [Fact]
    public void IndividualPlanAndFixedPauseExceptionKeepTheirOwnDurations()
    {
        var r=Request(people:2);
        var people=r.Document.Employees.ToArray();
        people[0]=people[0] with {InheritsCompanyDefaults=false,Workload=people[0].Workload with {WeeklyPlan=WeeklyWorkPlanPolicy.Uniform(144000,[DayOfWeek.Monday,DayOfWeek.Tuesday,DayOfWeek.Wednesday,DayOfWeek.Thursday,DayOfWeek.Friday])}};
        people[1]=people[1] with {FixedInterval=new(new(11,30),new(13,0))};
        r=r with {Document=r.Document with {Employees=people}};
        var result=AdapterComposition.Generate().Execute(r);
        Assert.Contains(result.Optimization!.Status,new[]{"optimal","feasible"});
        Assert.Equal(144000,result.Workloads!.Single(w=>w.EmployeeId==people[0].Id).PlannedSeconds);
        var second=result.Workloads!.Single(w=>w.EmployeeId==people[1].Id);
        Assert.Equal(153000,second.PlannedSeconds);Assert.Equal(5400,second.UnmetSeconds);
        Assert.All(result.Assignments.Where(a=>a.EmployeeId==people[1].Id),a=>Assert.Equal(TimeSpan.FromMinutes(90),a.Break!.End-a.Break.Start));
    }
    [Fact]
    public void OvernightCandidateKeepsCivilSecondsAndSundayWeeklySplit()
    {
        var r=Request(people:1);var day=new DateTime(2026,11,14);
        var work=r.Document.Company.DefaultWorkload with {WeeklyPlan=new(28800,[0,0,0,0,0,0,28800])};
        r=r with {Start=day,End=day,Document=r.Document with {Company=r.Document.Company with {OpensAt=new(22,0),ClosesAt=new(8,0),OperatingDays=[DayOfWeek.Saturday],DefaultWorkload=work,Coverage=[new("Equipe",DayOfWeek.Saturday,new(22,0),new(8,0),1)]},Employees=[r.Document.Employees[0] with {AllowsNightWork=true,ShiftStartsAt=new(22,0)}]}};
        var result=AdapterComposition.Generate().Execute(r);var shift=Assert.Single(result.Assignments);
        Assert.Contains(result.Optimization!.Status,new[]{"optimal","feasible"});
        Assert.Equal(28800,EffectiveWorkPolicy.Measure(shift).TotalSeconds);
        Assert.Equal(7200,EffectiveWorkPolicy.WorkTicksInWeek(shift,ScheduleWindow.WeekStart(day))/TimeSpan.TicksPerSecond);
        Assert.Equal(21600,EffectiveWorkPolicy.WorkTicksInWeek(shift,day.AddDays(1))/TimeSpan.TicksPerSecond);
        Assert.Equal(0,Assert.Single(result.Workloads!).UnmetSeconds);
    }
    [Fact]
    public void PartialAvailabilityProvidesShorterWorkWithoutInventingOpeningOrClosingPreferences()
    {
        var r=Request(people:1);r=r with {End=r.Start};
        var employee=r.Document.Employees[0] with {ShiftStartsAt=null,Availability=[new(r.Start.AddHours(10),r.Start.AddHours(15))]};
        r=r with {Document=r.Document with {Employees=[employee]}};
        var candidates=new ScheduleCandidateGenerator().Generate(r).ToArray();Assert.NotEmpty(candidates);
        Assert.All(candidates,a=>{Assert.DoesNotContain("opening",a.Tags);Assert.DoesNotContain("closing",a.Tags);Assert.True(a.Start>=r.Start.AddHours(10)&&a.End<=r.Start.AddHours(15));});
        var result=AdapterComposition.Generate().Execute(r);
        Assert.Contains(result.Optimization!.Status,new[]{"optimal","feasible"});
        Assert.Equal(14400,Assert.Single(result.Workloads!).PlannedSeconds);
        Assert.Equal(17280,Assert.Single(result.Workloads!).UnmetSeconds);
    }
    [Fact]
    public void NoDemandDoesNotInventShiftsAndExpiredCompensationDoesNotUseOvertimeToFillTarget()
    {
        var r=Request(people:1);
        var person=r.Document.Employees[0] with {AllowsOvertime=true};
        var work=r.Document.Company.DefaultWorkload with {WeeklyPlan=new(158400,[0,31680,31680,31680,31680,31680,0])};
        r=r with {Document=r.Document with {Employees=[person],Company=r.Document.Company with {DefaultWorkload=work}}};
        var result=AdapterComposition.Generate().Execute(r);
        Assert.Equal(40,result.Assignments.Sum(a=>EffectiveWorkPolicy.Measure(a).TotalHours));
        Assert.Equal(14400,Assert.Single(result.Workloads!).UnmetSeconds);
        r=r with {Document=r.Document with {Company=r.Document.Company with {Coverage=[]}}};
        result=AdapterComposition.Generate().Execute(r);
        Assert.Empty(result.Assignments);Assert.Equal(158400,Assert.Single(result.Workloads!).UnmetSeconds);
    }
}
