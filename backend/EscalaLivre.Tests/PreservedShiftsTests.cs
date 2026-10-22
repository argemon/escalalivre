using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Infrastructure.Solver;

namespace EscalaLivre.Tests;

public sealed class PreservedShiftsTests
{
    private static readonly DateTime Monday = new(2026,10,19);
    private static ScheduleRequest Request(DateTime? start = null, int open = 8, int close = 12, WorkloadRule? workload = null)
    {
        var day = start ?? Monday;
        var rule = workload ?? new("dayBased",7,0,44,TimeSpan.FromHours(4));
        var company = new CompanyRules("Loja",new(open,0),new(close,0),Enum.GetValues<DayOfWeek>(),rule,
            new(TimeSpan.Zero,TimeSpan.Zero,TimeSpan.FromHours(2)),TimeSpan.FromHours(11),
            [new("atendente",day.DayOfWeek,new(open,0),new(close,0),1)]);
        var employee = new Employee(Guid.NewGuid(),"Pessoa","atendente",true,rule,[],[],[],false,true,[],ShiftStartsAt:new(open,0));
        return new(new("1.0.0",Guid.NewGuid(),company,[employee],[],DateTimeOffset.UtcNow),day,day.AddDays(1).AddSeconds(-1));
    }
    private static ShiftAssignment Shift(ScheduleRequest r, DateTime start, int hours = 4)
        => new(Guid.NewGuid(),r.Document.Employees[0].Id,"atendente",start,start.AddHours(hours),null,"manual",["preserve-exactly"]);
    private static ScheduleRequest With(ScheduleRequest r, params ShiftAssignment[] shifts)
        => r with {Document=r.Document with {Assignments=shifts}};
    private static ShiftAssignment[] Generated(ScheduleRequest r, ScheduleResult result)
        => result.Assignments.Where(a => ScheduleWindow.Contains(a,r.Start,r.End)).ToArray();

    [Fact]
    public void OnlyStartDatesInsideTheWindowAreReplacedAndRegenerationDoesNotDuplicate()
    {
        var r = Request();
        var before = Shift(r,Monday.AddDays(-5).AddHours(22));
        var after = Shift(r,Monday.AddDays(5).AddHours(8));
        var old = Shift(r,Monday.AddHours(8));
        r=With(r,before,old,after);
        var solver=new OrToolsScheduleSolver();
        var result=solver.Solve(r);
        Assert.Same(before,Assert.Single(result.Assignments,a=>a.Id==before.Id));
        Assert.Same(after,Assert.Single(result.Assignments,a=>a.Id==after.Id));
        Assert.DoesNotContain(result.Assignments,a=>a.Id==old.Id);
        Assert.Single(Generated(r,result));
        Assert.Single(result.Decisions);
        var again=solver.Solve(r with {Document=r.Document with {Assignments=result.Assignments}});
        Assert.Equal(3,again.Assignments.Count);
        Assert.Equal(again.Assignments.Count,again.Assignments.Select(a=>a.Id).Distinct().Count());
    }

    [Fact]
    public void OvernightOwnershipIncludesTheWholeShiftOnItsStartDay()
    {
        var r=Request(open:22,close:2);
        var before=Shift(r,Monday.AddDays(-1).AddHours(22));
        var old=Shift(r,Monday.AddHours(22));
        var after=Shift(r,Monday.AddDays(1).AddHours(22));
        r=With(r,before,old,after);
        var result=new OrToolsScheduleSolver().Solve(r);
        Assert.Contains(before,result.Assignments);Assert.Contains(after,result.Assignments);
        Assert.DoesNotContain(result.Assignments,a=>a.Id==old.Id);
        var generated=Assert.Single(Generated(r,result));
        Assert.Equal(Monday.AddDays(1).AddHours(2),generated.End);
        Assert.DoesNotContain(result.Conflicts,c=>c.Code=="minimumRest");
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void CompanyRestChecksBothEdges(bool future)
    {
        var r=Request();
        r=r with {Document=r.Document with {Company=r.Document.Company with {MinimumRest=TimeSpan.FromHours(13)}}};
        var fixedShift=Shift(r,future?Monday.AddDays(1):Monday.AddDays(-1).AddHours(18));
        r=With(r,fixedShift);
        var result=new OrToolsScheduleSolver().Solve(r);
        Assert.Empty(Generated(r,result));Assert.Contains(fixedShift,result.Assignments);Assert.NotEmpty(result.Gaps);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void HourBasedRestChecksBothEdges(bool future)
    {
        var r=Request(workload:new("hourBased",4,36,44,TimeSpan.FromHours(4)));
        r=With(r,Shift(r,Monday.AddDays(future?1:-1).AddHours(8)));
        Assert.Empty(Generated(r,new OrToolsScheduleSolver().Solve(r)));
    }

    [Fact]
    public void ExactRestBoundaryIsAllowed()
    {
        var r=Request(open:9,close:13);
        r=With(r,Shift(r,Monday.AddDays(-1).AddHours(18)),Shift(r,Monday.AddDays(1)));
        var result=new OrToolsScheduleSolver().Solve(r);
        Assert.Single(Generated(r,result));Assert.DoesNotContain(result.Conflicts,c=>c.Code=="minimumRest");
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(1)]
    public void DayCycleIncludesPreservedDaysOnBothSides(int offset)
    {
        var r=Request(workload:new("dayBased",1,1,44,TimeSpan.FromHours(4)));
        r=With(r,Shift(r,Monday.AddDays(offset).AddHours(8)));
        Assert.Empty(Generated(r,new OrToolsScheduleSolver().Solve(r)));
    }

    [Fact]
    public void OneCycleCanSpanBothEdgesAtOnce()
    {
        var r=Request(workload:new("dayBased",2,1,44,TimeSpan.FromHours(4)));
        r=With(r,Shift(r,Monday.AddDays(-1).AddHours(8)),Shift(r,Monday.AddDays(1).AddHours(8)));
        Assert.Empty(Generated(r,new OrToolsScheduleSolver().Solve(r)));
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(1)]
    public void WeeklyLimitIncludesWorkBeforeAndAfterThePeriod(int offset)
    {
        var r=Request(workload:new("dayBased",7,0,4,TimeSpan.FromHours(4)));
        r=With(r,Shift(r,Monday.AddDays(offset).AddHours(8)));
        Assert.Empty(Generated(r,new OrToolsScheduleSolver().Solve(r)));
    }

    [Fact]
    public void OvernightWorkAndBreaksAreSplitAtTheWeeklyBoundary()
    {
        var r=Request();
        var shift=Shift(r,Monday.AddDays(-2).AddHours(22)); // Saturday to Sunday
        shift=shift with {Break=new(shift.Start.AddHours(1.5),shift.Start.AddHours(2.5))};
        var saturdayWeek=ScheduleWindow.WeekStart(shift.Start);
        Assert.Equal(TimeSpan.FromHours(1.5).Ticks,ScheduleWindow.WorkTicksInWeek(shift,saturdayWeek));
        Assert.Equal(TimeSpan.FromHours(1.5).Ticks,ScheduleWindow.WorkTicksInWeek(shift,saturdayWeek.AddDays(7)));
    }

    [Theory]
    [InlineData(5, false)]
    [InlineData(6, true)]
    public void OvernightTailConsumesTheNextWeeksCapacity(int limit, bool allowed)
    {
        var r=Request(workload:new("dayBased",7,0,limit,TimeSpan.FromHours(4)));
        // Two of these four hours belong to the same week as Monday.
        r=With(r,Shift(r,Monday.AddDays(-2).AddHours(22)));
        var result=new OrToolsScheduleSolver().Solve(r);
        Assert.Equal(allowed?1:0,Generated(r,result).Length);Assert.DoesNotContain(result.Conflicts,c=>c.Code=="weeklyLimit");
    }

    [Theory]
    [InlineData(5, false)]
    [InlineData(6, true)]
    public void GeneratedOvernightTailAlsoRespectsTheFollowingWeeksHistory(int limit, bool allowed)
    {
        var saturday=Monday.AddDays(5);
        var r=Request(saturday,22,2,new("dayBased",7,0,limit,TimeSpan.FromHours(4)));
        r=With(r,Shift(r,saturday.AddDays(2).AddHours(8)));
        Assert.Equal(allowed?1:0,Generated(r,new OrToolsScheduleSolver().Solve(r)).Length);
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(1)]
    public void CycleAllowsTheRemainingCapacityAtEitherEdge(int offset)
    {
        var r=Request(workload:new("dayBased",2,1,44,TimeSpan.FromHours(4)));
        r=With(r,Shift(r,Monday.AddDays(offset).AddHours(8)));
        var result=new OrToolsScheduleSolver().Solve(r);
        Assert.Single(Generated(r,result));Assert.Empty(result.Conflicts);
    }

    [Fact]
    public void AlreadyOverfullHistoryIsPreservedAndReportedWithoutAddingWork()
    {
        var r=Request(workload:new("dayBased",7,0,4,TimeSpan.FromHours(4)));
        r=With(r,Shift(r,Monday.AddDays(-1).AddHours(8)),Shift(r,Monday.AddDays(1).AddHours(8)));
        var result=new OrToolsScheduleSolver().Solve(r);
        Assert.Equal(r.Document.Assignments,result.Assignments);
        Assert.Contains(result.Conflicts,c=>c.Code=="weeklyLimit");
        Assert.DoesNotContain(result.Conflicts,c=>c.Code=="solverInfeasible");
    }

    [Fact]
    public void ExistingOvernightTailAlreadyCoversDemandAtTheFirstEdge()
    {
        var r=Request(open:0,close:2);
        r=With(r,Shift(r,Monday.AddDays(-1).AddHours(22)));
        var result=new OrToolsScheduleSolver().Solve(r);
        Assert.Empty(Generated(r,result));Assert.Empty(result.Gaps);Assert.Equal(1,result.CoverageScore);
    }

    [Fact]
    public void InfeasibleFixedHolidayTurnDoesNotDiscardAnyOriginalShift()
    {
        var r=Request();
        var old=Shift(r,Monday.AddHours(8)) with {Tags=["holiday:2026-10-19"]};
        var future=Shift(r,Monday.AddDays(1));
        r=With(r,old,future);
        r=r with {Document=r.Document with {Company=r.Document.Company with {Holidays=[new(DateOnly.FromDateTime(Monday),"Feriado")],MinimumRest=TimeSpan.FromHours(13)}}};
        var result=new OrToolsScheduleSolver().Solve(r);
        Assert.Contains(result.Conflicts,c=>c.Code=="solverInfeasible");
        Assert.Equal("infeasible",result.Optimization?.Status);
        Assert.Equal(r.Document.Assignments,result.Assignments);Assert.Empty(result.Decisions);
    }
}
