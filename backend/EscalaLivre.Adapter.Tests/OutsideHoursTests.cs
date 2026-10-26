using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Infrastructure.Solver;
namespace EscalaLivre.Adapter.Tests;
public sealed class OutsideHoursTests {
 [Theory]
 [InlineData(true)]
 [InlineData(false)]
 public void ClosedDayCoverageRequiresExplicitAuthorizationAndSameRole(bool authorized) {
  var workload = new WorkloadRule("dayBased",7,0,44,TimeSpan.FromHours(3));
  var company = new CompanyRules("Loja",new TimeOnly(9,0),new TimeOnly(18,0),[DayOfWeek.Monday],workload,new LunchRule(TimeSpan.Zero,TimeSpan.Zero,TimeSpan.FromHours(4)),TimeSpan.FromHours(11),[new CoverageRequirement("Segurança Patrimonial",DayOfWeek.Sunday,new TimeOnly(20,0),new TimeOnly(23,0),1,"custom",authorized)]);
  var guard = new Employee(Guid.NewGuid(),"Vigia","Segurança Patrimonial",true,workload,[],[],[],false,true,[]);
  var seller = new Employee(Guid.NewGuid(),"Vendedor","Vendedor",true,workload,[],[],[],false,true,[]);
  var document = new EscalaLivreDocument("1.0.0",Guid.NewGuid(),company,[guard,seller],[],DateTimeOffset.UtcNow);
        ScheduleResult result = AdapterComposition.Generate().Execute(new ScheduleRequest(document,new DateTime(2026,10,18),new DateTime(2026,10,18,23,59,59)));
  Assert.DoesNotContain(result.Assignments,a => a.EmployeeId == seller.Id);
  if (authorized) { Assert.Contains(result.Assignments,a => a.EmployeeId == guard.Id); Assert.DoesNotContain(result.Conflicts,c => c.Code == "workingDay"); }
  else Assert.Empty(result.Assignments);
 }
}
