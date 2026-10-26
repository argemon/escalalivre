using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Scheduling;
using EscalaLivre.Domain.Scheduling;

namespace EscalaLivre.Analysis.Tests;

public sealed class AnalysisContractTests
{
    public static IEnumerable<object[]> Scenarios()
    {
        using var json = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "rule-scenarios.json")));
        return json.RootElement.GetProperty("scenarios").EnumerateArray().Select(s => new object[] { s.GetProperty("id").GetString()! }).ToArray();
    }

    internal static ScheduleRequest Request(string id = "baseline-eight-work-hours")
    {
        using var json = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "rule-scenarios.json")));
        return json.RootElement.GetProperty("scenarios").EnumerateArray().Single(s => s.GetProperty("id").GetString() == id)
            .GetProperty("request").Deserialize<ScheduleRequest>(ScheduleJson.CreateOptions())!;
    }

    [Theory]
    [MemberData(nameof(Scenarios))]
    public void AnalysisAndValidationPreserveCompletePreExtractionResponse(string id)
    {
        var previousCulture = CultureInfo.CurrentCulture;
        try
        {
            CultureInfo.CurrentCulture = CultureInfo.InvariantCulture;
            var options = ScheduleJson.CreateOptions();
            var request = Request(id);
            var before = JsonSerializer.Serialize(request, options);
            var analyzer = new ScheduleAnalyzer(new ScheduleEvaluator());
            var analysis = new AnalyzeSchedule(analyzer).Execute(request);
            var validation = new ValidateSchedule(analyzer).Execute(request);
            var serialized = JsonSerializer.Serialize(analysis, options);
            Assert.Equal(serialized, JsonSerializer.Serialize(validation, options));
            Assert.Equal(before, JsonSerializer.Serialize(request, options));
            using var hashes = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "analysis-baseline-hashes.json")));
            var expected = hashes.RootElement.EnumerateArray().Single(s => s.GetProperty("id").GetString() == id).GetProperty("sha256").GetString();
            Assert.Equal(expected, Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(serialized))));
            Assert.Equal("not-run", analysis.Optimization?.Status);
            Assert.Same(request.Document.Assignments, analysis.Assignments);
        }
        finally { CultureInfo.CurrentCulture = previousCulture; }
    }

    [Fact]
    public void AnalysisTestDeploymentHasNoInfrastructureOrOrToolsDependency()
    {
        string[] forbidden = ["EscalaLivre.Infrastructure", "Google.OrTools", "EscalaLivre.Api"];
        var deps = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "EscalaLivre.Analysis.Tests.deps.json"));
        foreach (var name in forbidden)
        {
            Assert.DoesNotContain(name, deps);
            Assert.DoesNotContain(AppDomain.CurrentDomain.GetAssemblies(), a => a.GetName().Name!.StartsWith(name, StringComparison.Ordinal));
            Assert.DoesNotContain(Directory.EnumerateFiles(AppContext.BaseDirectory, "*", SearchOption.AllDirectories), f => Path.GetFileName(f).Contains(name, StringComparison.OrdinalIgnoreCase));
        }
        Assert.DoesNotContain(typeof(ScheduleEvaluator).Assembly.GetReferencedAssemblies(), a => a.Name!.StartsWith("EscalaLivre.Application", StringComparison.Ordinal));
    }

    [Fact]
    public void HiringEstimatesRemainAvailableWithoutOptimizer()
    {
        using var json = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "hiring-demand-scenarios.json")));
        var document = json.RootElement.GetProperty("document").Deserialize<EscalaLivreDocument>(ScheduleJson.CreateOptions())!;
        var request = new ScheduleRequest(document, new(2026,10,1), new(2026,10,31,23,59,59));
        var result = new AnalyzeSchedule(new ScheduleAnalyzer(new ScheduleEvaluator())).Execute(request);
        var hiring = Assert.Single(result.HiringSuggestions);
        Assert.Equal(496, hiring.TotalHours);
        Assert.Equal(112, hiring.WeeklyHours);
        Assert.Equal(3, hiring.MinimumPeople);
    }
}
