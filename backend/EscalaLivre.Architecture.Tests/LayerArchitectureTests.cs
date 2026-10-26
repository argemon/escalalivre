using System.Reflection;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using EscalaLivre.Api;
using EscalaLivre.Application.Scheduling;
using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Infrastructure.Solver;

namespace EscalaLivre.Architecture.Tests;

public sealed class LayerArchitectureTests
{
    private static readonly Dictionary<string, Assembly> Layers = new()
    {
        ["Domain"] = typeof(ScheduleEvaluator).Assembly,
        ["Application"] = typeof(GenerateSchedule).Assembly,
        ["Infrastructure"] = typeof(OrToolsScheduleOptimizer).Assembly,
        ["Api"] = typeof(CalculationWorker).Assembly
    };
    private static readonly Dictionary<string, string[]> Allowed = new()
    {
        ["Domain"] = [], ["Application"] = ["Domain"],
        ["Infrastructure"] = ["Domain", "Application"], ["Api"] = ["Domain", "Application", "Infrastructure"]
    };
    private static string Input(string relative) => Path.Combine(AppContext.BaseDirectory, "ArchitectureInputs", relative);
    private static bool ExternalModel(Type type)
        => new[] { "Google.OrTools", "PdfSharp", "MigraDoc" }.Any(prefix => (type.Namespace ?? "").StartsWith(prefix, StringComparison.Ordinal));

    [Theory]
    [InlineData("Domain")]
    [InlineData("Application")]
    [InlineData("Infrastructure")]
    [InlineData("Api")]
    public void AssemblyAndProjectDependenciesRespectLayerDirection(string layer)
    {
        var allowed = Allowed[layer].Select(name => "EscalaLivre." + name).ToHashSet();
        var references = Layers[layer].GetReferencedAssemblies().Select(a => a.Name!).ToArray();
        Assert.All(references.Where(n => n.StartsWith("EscalaLivre.")), n => Assert.Contains(n, allowed));
        if (layer is "Domain" or "Application")
            Assert.DoesNotContain(references, name => new[] { "Google.OrTools", "PdfSharp", "MigraDoc", "Microsoft.AspNetCore", "Microsoft.Extensions.DependencyInjection" }.Any(name.StartsWith));
        if (layer == "Domain")
            Assert.DoesNotContain(references, name => name.StartsWith("FluentValidation") || name.StartsWith("System.Text.Json"));
        var project = XDocument.Load(Input(layer + ".csproj"));
        var declared = project.Descendants("ProjectReference").Select(e => Path.GetFileNameWithoutExtension(e.Attribute("Include")!.Value.Replace((char)92, '/'))).ToArray();
        Assert.Equal(allowed.Order(), declared.Order());
        var packages = project.Descendants("PackageReference").Select(e => e.Attribute("Include")!.Value).ToArray();
        // Protect test isolation as well as production direction: adapter tests cannot quietly regain API.
        string? testGroup = layer switch { "Domain" => "Analysis", "Infrastructure" => "Adapter", _ => null };
        if (testGroup is not null)
        {
            var testProject = XDocument.Load(Input(Path.Combine("Tests", testGroup + ".csproj")));
            var testReferences = testProject.Descendants("ProjectReference")
                .Select(e => Path.GetFileNameWithoutExtension(e.Attribute("Include")!.Value.Replace((char)92, '/'))).ToArray();
            Assert.Equal(new[] { testGroup == "Analysis" ? "EscalaLivre.Application" : "EscalaLivre.Infrastructure" }, testReferences);
        }
        if (layer == "Domain") Assert.Empty(packages);
        if (layer == "Application") Assert.Equal(new[] { "FluentValidation" }, packages);
    }

    [Theory]
    [InlineData("Domain")]
    [InlineData("Application")]
    [InlineData("Infrastructure")]
    [InlineData("Api")]
    public void ExportedSurfaceDoesNotLeakSolverOrPdfTypes(string layer)
    {
        var failures = Layers[layer].GetExportedTypes().SelectMany(type => SurfaceScanner.Leaks(type, ExternalModel)).ToArray();
        Assert.True(failures.Length == 0, string.Join(Environment.NewLine, failures));
    }

    [Theory]
    [InlineData("Domain")]
    [InlineData("Application")]
    public void InnerLayerSourceImportsCannotBypassTheDependencyRules(string layer)
    {
        var forbidden = new[] { "EscalaLivre.Infrastructure", "EscalaLivre.Api", "Google.OrTools", "PdfSharp", "MigraDoc", "Microsoft.AspNetCore", "Microsoft.Extensions.DependencyInjection" }
            .Concat(layer == "Domain" ? new[] { "EscalaLivre.Application", "FluentValidation", "System.Text.Json" } : []).ToArray();
        var files = Directory.GetFiles(Input(layer), "*.cs", SearchOption.AllDirectories);
        Assert.NotEmpty(files);
        var imports = files.SelectMany(file => ImportedNamespaces(File.ReadAllText(file))).ToArray();
        Assert.NotEmpty(imports);
        foreach (var imported in imports)
            Assert.DoesNotContain(forbidden, prefix => imported.StartsWith(prefix, StringComparison.Ordinal));
    }

    private static string[] ImportedNamespaces(string source)
        => Regex.Matches(source, @"\busing\s+(?:static\s+)?(?:\w+\s*=\s*)?([\w.]+)\s*;")
            .Select(import => import.Groups[1].Value).ToArray();

    [Fact]
    public void ImportScannerRecognizesAliasStaticAndOrdinaryUsings()
        => Assert.Equal(new[] { "EscalaLivre.Infrastructure.Solver", "Google.OrTools.Sat", "EscalaLivre.Application.Contracts" },
            ImportedNamespaces("using Engine = EscalaLivre.Infrastructure.Solver;\nusing static Google.OrTools.Sat;\nusing EscalaLivre.Application.Contracts;"));

    [Fact]
    public void LegacyCombinedCapabilityAndItsImplementationsAreGone()
    {
        Assert.Null(Layers["Application"].GetType("EscalaLivre.Application.Scheduling.IScheduleSolver"));
        Assert.Null(Layers["Infrastructure"].GetType("EscalaLivre.Infrastructure.Solver.OrToolsScheduleSolver"));
        Assert.Null(Layers["Infrastructure"].GetType("EscalaLivre.Infrastructure.Solver.LegacySolverComposition"));
        Assert.Equal(new[] { "Analyze" }, typeof(IScheduleAnalyzer).GetMethods().Select(m => m.Name));
        Assert.Equal(new[] { "Optimize" }, typeof(IScheduleOptimizer).GetMethods().Select(m => m.Name));
    }

    [Fact]
    public void ScannerDetectsNestedGenericsArraysEventsAttributesAndConstraints()
    {
        var leaks = SurfaceScanner.Leaks(typeof(LeakingFixture), t => t == typeof(ForbiddenBoundary)).ToArray();
        foreach (var member in new[] { ".ctor", "Value", "Return", "Notification", "Constrained", "attribute" })
            Assert.Contains(leaks, leak => leak.Contains(member, StringComparison.Ordinal));
    }

    public class ForbiddenBoundary { }
    public sealed class BoundaryReferenceAttribute(Type type) : Attribute { public Type Type { get; } = type; }
    [BoundaryReference(typeof(ForbiddenBoundary))]
    public sealed class LeakingFixture
    {
        public LeakingFixture(ForbiddenBoundary[] input) { }
        public IReadOnlyDictionary<string, Func<ForbiddenBoundary[]>> Value => throw new NotSupportedException();
        public ForbiddenBoundary Return(ref ForbiddenBoundary input) => input;
        public event Action<ForbiddenBoundary> Notification { add { } remove { } }
        public void Constrained<T>() where T : ForbiddenBoundary { }
    }
}

internal static class SurfaceScanner
{
    internal static IEnumerable<string> Leaks(Type root, Func<Type, bool> forbidden)
    {
        var surfaces = new List<(string Location, Type Type)>();
        void Add(string where, Type? type) { if (type is not null) surfaces.Add((where, type)); }
        void Attributes(string where, IEnumerable<CustomAttributeData> attributes)
        {
            foreach (var attribute in attributes)
            {
                Add(where + ".attribute", attribute.AttributeType);
                void Argument(CustomAttributeTypedArgument argument)
                {
                    Add(where + ".attribute", argument.ArgumentType);
                    if (argument.Value is Type type) Add(where + ".attribute", type);
                    if (argument.Value is IEnumerable<CustomAttributeTypedArgument> items) foreach (var item in items) Argument(item);
                }
                foreach (var argument in attribute.ConstructorArguments) Argument(argument);
                foreach (var named in attribute.NamedArguments) Argument(named.TypedValue);
            }
        }
        Add(root.Name, root.BaseType);
        foreach (var type in root.GetInterfaces().Concat(root.GetGenericArguments())) Add(root.Name, type);
        Attributes(root.Name, root.GetCustomAttributesData());
        const BindingFlags flags = BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly;
        foreach (var method in root.GetMethods(flags).Cast<MethodBase>().Concat(root.GetConstructors(flags)))
        {
            if (method is MethodInfo info) { Add(method.Name, info.ReturnType); Attributes(method.Name, info.ReturnParameter.GetCustomAttributesData()); }
            foreach (var parameter in method.GetParameters()) { Add(method.Name, parameter.ParameterType); Attributes(method.Name, parameter.GetCustomAttributesData()); }
            if (method.IsGenericMethod) foreach (var argument in method.GetGenericArguments()) Add(method.Name, argument);
            Attributes(method.Name, method.GetCustomAttributesData());
        }
        foreach (var property in root.GetProperties(flags)) { Add(property.Name, property.PropertyType); Attributes(property.Name, property.GetCustomAttributesData()); }
        foreach (var field in root.GetFields(flags)) { Add(field.Name, field.FieldType); Attributes(field.Name, field.GetCustomAttributesData()); }
        foreach (var evt in root.GetEvents(flags)) { Add(evt.Name, evt.EventHandlerType); Attributes(evt.Name, evt.GetCustomAttributesData()); }
        foreach (var (location, type) in surfaces)
            foreach (var nested in Expand(type, []))
                if (forbidden(nested)) yield return root.FullName + "." + location + " -> " + nested.FullName;
    }

    private static IEnumerable<Type> Expand(Type type, HashSet<Type> visited)
    {
        if (!visited.Add(type)) yield break;
        yield return type;
        if (type.HasElementType) foreach (var child in Expand(type.GetElementType()!, visited)) yield return child;
        if (type.IsGenericType) foreach (var argument in type.GetGenericArguments()) foreach (var child in Expand(argument, visited)) yield return child;
        if (type.IsGenericParameter) foreach (var constraint in type.GetGenericParameterConstraints()) foreach (var child in Expand(constraint, visited)) yield return child;
    }
}
