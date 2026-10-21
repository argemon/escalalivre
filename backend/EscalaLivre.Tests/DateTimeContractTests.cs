using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Validation;
using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Infrastructure.ImportExport;
using EscalaLivre.Infrastructure.Solver;

namespace EscalaLivre.Tests;

public sealed class DateTimeContractTests
{
    private static EscalaLivreDocument Document()
    {
        var rule=new WorkloadRule("dayBased",7,0,44,TimeSpan.FromHours(8));
        var company=new CompanyRules("Loja",new(8,0),new(22,0),Enum.GetValues<DayOfWeek>(),rule,
            new(TimeSpan.FromHours(1),TimeSpan.FromHours(1),TimeSpan.FromHours(4)),TimeSpan.FromHours(11),[],TimeZone:"America/Cuiaba");
        var employee=new Employee(Guid.NewGuid(),"Pessoa","vendedor",true,rule,[],[],[],false,true,[]);
        var shift=new ShiftAssignment(Guid.NewGuid(),employee.Id,employee.Role,new(2026,10,21,9,0,0),new(2026,10,21,18,0,0),new(new(2026,10,21,13,0,0),new(2026,10,21,14,0,0)),"manual",[]);
        return new("1.0.0",Guid.NewGuid(),company,[employee],[shift],DateTimeOffset.UtcNow,new(new(2026,10,21),new(2026,10,21)));
    }
    [Fact]
    public void NineOClockSurvivesNativeAndApiRoundTrips()
    {
        var serializer=new NativeScheduleSerializer();var original=Document();
        var exported=serializer.Export(new(original,"native"));
        var imported=serializer.Import(new(exported.FileName,exported.ContentBase64,"native"));
        var options=ScheduleJson.CreateOptions();
        var request=new ScheduleRequest(imported,new(2026,10,21),new(2026,10,21,23,59,59));
        var received=JsonSerializer.Deserialize<ScheduleRequest>(JsonSerializer.Serialize(request,options),options)!;
        Assert.True(new ScheduleRequestValidator().Validate(received).IsValid);
        Assert.Equal(original.Assignments[0].Start,received.Document.Assignments[0].Start);
        Assert.Equal(DateTimeKind.Unspecified,received.Document.Assignments[0].Start.Kind);
        var response=new OrToolsScheduleSolver().Analyze(received);
        Assert.Contains("2026-10-21T09:00:00",JsonSerializer.Serialize(response,options));
        Assert.Equal(TimeSpan.Zero,received.Document.UpdatedAt.Offset);
    }
    [Theory]
    [InlineData("2026-10-21T13:00:00Z","2026-10-21T09:00:00")]
    [InlineData("2026-10-21T09:00:00-04:00","2026-10-21T09:00:00")]
    [InlineData("2026-10-22T02:00:00Z","2026-10-21T22:00:00")]
    [InlineData("2027-01-01T02:00:00Z","2026-12-31T22:00:00")]
    public void QualifiedTimesUseTheCompanyZoneRatherThanTheServer(string instant,string expected)
    {
        Assert.Equal(expected,ScheduleJson.Civil(instant,"America/Cuiaba").ToString("yyyy-MM-dd'T'HH:mm:ss"));
        Assert.Equal(DateTimeKind.Unspecified,ScheduleJson.Civil(instant,"America/Cuiaba").Kind);
    }
    [Fact]
    public void LegacyNativeImportNormalizesOvernightPauseAndAvailability()
    {
        var options=ScheduleJson.CreateOptions();
        var node=JsonNode.Parse(JsonSerializer.Serialize(Document(),options))!;
        var a=node["assignments"]![0]!;
        a["start"]="2026-10-22T02:00:00Z";a["end"]="2026-10-22T10:00:00Z";
        a["break"]!["start"]="2026-10-22T06:00:00Z";a["break"]!["end"]="2026-10-22T07:00:00Z";
        node["employees"]![0]!["availability"]=new JsonArray(new JsonObject { ["start"]="2026-10-22T02:00:00Z",["end"]="2026-10-22T10:00:00Z" });
        node["updatedAt"]="2026-10-21T09:00:00-04:00";
        var document=new NativeScheduleSerializer().Import(new("legacy.escalalivre",Convert.ToBase64String(Encoding.UTF8.GetBytes(node.ToJsonString())),"native"));
        var shift=Assert.Single(document.Assignments);
        Assert.Equal(new DateTime(2026,10,21,22,0,0),shift.Start);
        Assert.Equal(new DateTime(2026,10,22,6,0,0),shift.End);
        Assert.Equal(new DateTime(2026,10,22,2,0,0),shift.Break!.Start);
        Assert.Equal(shift.Start,document.Employees[0].Availability[0].Start);
        Assert.Equal(TimeSpan.Zero,document.UpdatedAt.Offset);
    }
}
