using System.Text.Json;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Adapter.Tests;

public sealed class ContractMinimumGenerationTests
{
    private static ScheduleRequest Request() => JsonSerializer.Deserialize<ScheduleRequest>(
        File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"mixed-contract-generation.json")),ScheduleJson.CreateOptions())!;

    [Fact]
    public void MismatchedDistributionCannotReduceTheContractMinimum()
    {
        var r=Request();var e=r.Document.Employees[0];
        var work=e.Workload with {WeeklyPlan=new(72000,new int[7])};
        r=r with {Document=r.Document with {Employees=[e with {Workload=work}]}};
        var result=AdapterComposition.Generate().Execute(r);
        Assert.Equal("infeasible",result.Optimization!.Status);
        Assert.Contains(result.Conflicts,c=>c.Code=="solverInfeasible"&&c.Message.Contains("distribuição"));
        Assert.Equal(r.Document.Assignments,result.Assignments);
    }

    [Fact]
    public void InactiveContractsDoNotBlockTheRemainingEmployees()
    {
        var r=Request();var e=r.Document.Employees[0];
        r=r with {Document=r.Document with {Company=r.Document.Company with {Coverage=[]},
            Employees=r.Document.Employees.Select(p=>p.Id==e.Id?p with {InactiveFrom=DateOnly.FromDateTime(r.Start)}:p).ToArray()}};
        var result=AdapterComposition.Generate().Execute(r);
        Assert.Contains(result.Optimization!.Status,new[]{"optimal","feasible"});
        Assert.DoesNotContain(result.Assignments,a=>a.EmployeeId==e.Id);
        Assert.Empty(ContractMinimumPolicy.Missing(r.Document,r.Start,r.End,result.Assignments));
        Assert.Equal(228,result.Assignments.Sum(a=>EffectiveWorkPolicy.Measure(a).TotalHours),8);
    }

    private sealed class EmptyOptimizer : EscalaLivre.Application.Scheduling.IScheduleOptimizer
    {
        public EscalaLivre.Application.Scheduling.ScheduleOptimizationResult Optimize(ScheduleRequest request)
            => new(request.Document.Assignments,[],"feasible",[]);
    }

    [Fact]
    public void ApplicationRejectsAnOptimizerThatReportsSuccessWithoutCompletingContracts()
    {
        var r=Request();
        var result=new EscalaLivre.Application.Scheduling.GenerateSchedule(new EmptyOptimizer(),PureComposition.Analyzer()).Execute(r);
        Assert.Equal("invalid",result.Optimization!.Status);
        Assert.Contains(result.Conflicts,c=>c.Code=="solverInvalid"&&c.Message.Contains("carga contratada"));
        Assert.Equal(r.Document.Assignments,result.Assignments);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void MixedContractsAreMandatoryEvenWithNoCoverageDemand(bool noDemand)
    {
        var r=Request();
        if(noDemand)r=r with {Document=r.Document with {Company=r.Document.Company with {Coverage=[]}}};
        var result=AdapterComposition.Generate().Execute(r);
        Assert.Contains(result.Optimization!.Status,new[]{"optimal","feasible"});
        Assert.Empty(ContractMinimumPolicy.Missing(r.Document,r.Start,r.End,result.Assignments));
        Assert.Equal(248,result.Assignments.Sum(a=>EffectiveWorkPolicy.Measure(a).TotalHours),8);
        Assert.DoesNotContain(result.Conflicts,c=>c.Severity=="error");
        Assert.Equal(2,result.Workloads!.Single(w=>w.EmployeeId==r.Document.Employees[5].Id).UnmetSeconds/3600);
        foreach(var e in r.Document.Employees)
        {
            var planned=result.Workloads!.Single(w=>w.EmployeeId==e.Id);
            Assert.Equal(e.Name=="42h — 5x2 com 8h"?2:0,planned.UnmetSeconds/3600);
        }
        if(!noDemand)Assert.Equal(1,result.CoverageScore);
        var overlapping=result.Assignments.GroupBy(a=>a.Start.Date).Any(g=>g.Count()>2);
        Assert.True(overlapping,"The coverage minimum must not cap the number of people working.");
    }

    [Fact]
    public void ImpossibleMinimumPreservesSavedShiftsInsteadOfAcceptingAPartialGeneration()
    {
        var r=Request();var e=r.Document.Employees[0];
        var saved=new ShiftAssignment(Guid.NewGuid(),e.Id,e.Role,r.Start.AddDays(1).AddHours(8),r.Start.AddDays(1).AddHours(13),
            new(r.Start.AddDays(1).AddHours(10),r.Start.AddDays(1).AddHours(11)),"manual",[]);
        r=r with {Document=r.Document with {Assignments=[saved],Employees=r.Document.Employees.Select(p=>p.Id==e.Id?p with {
            Availability=[new(r.Start.AddDays(1).AddHours(8),r.Start.AddDays(1).AddHours(13))]}:p).ToArray()}};
        var result=AdapterComposition.Generate().Execute(r);
        Assert.Equal("infeasible",result.Optimization!.Status);
        Assert.Equal(r.Document.Assignments,result.Assignments);
        Assert.Contains(result.Conflicts,c=>c.Code=="solverInfeasible");
    }
}
