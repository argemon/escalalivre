using System.Globalization;
using System.Text.Json;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Application.Planning;
using EscalaLivre.Application.Scheduling;
using EscalaLivre.Domain.Scheduling;

Console.InputEncoding = System.Text.Encoding.UTF8;
Console.OutputEncoding = new System.Text.UTF8Encoding(false);
CultureInfo.CurrentCulture = CultureInfo.InvariantCulture;
var options = ScheduleJson.CreateOptions();
var input = Console.In.ReadToEnd();
if (input.Length > 8_000_000) throw new ArgumentException("Parity batch too large.");
var requests = JsonSerializer.Deserialize<ScheduleRequest[]>(input, options)!;
if (requests.Length > 256) throw new ArgumentException("Parity batch limited to 256 cases.");
var analyzer = new ScheduleAnalyzer(new ScheduleEvaluator());
var results = requests.Select(request => {
    if (request.Document.Employees.Count > 16 || request.Document.Assignments.Count > 64 || request.Document.Company.Coverage.Count > 32)
        throw new ArgumentException("Parity case exceeds test-only complexity bound.");
    if (EscalaLivre.Application.Validation.DocumentSafety.Error(request.Document) is { } error) throw new FormatException(error);
    var before = JsonSerializer.Serialize(request, options);
    var analysis = new AnalyzeSchedule(analyzer).Execute(request);
    var validation = new ValidateSchedule(analyzer).Execute(request);
    var migrated = JsonSerializer.Serialize(JsonSerializer.Deserialize<ScheduleRequest>(before, options), options);
    var mapping = PlanningDocumentMapping.Open(request);
    var assignments = JsonSerializer.Serialize(request.Document.Assignments, options);
    var roundTripPreserved = assignments == JsonSerializer.Serialize(mapping.ToDocument().Assignments, options);
    var selected = mapping.Schedule.Assignments.Where(a => mapping.Schedule.Period.ContainsStart(a.Window)).ToArray();
    mapping.Schedule.ReplacePeriod(selected);
    var replaced = mapping.ToDocument().Assignments;
    // Replacement may reorder history before selected shifts; compare whole records by stable identity.
    var preserveReplacement = assignmentsById(request.Document.Assignments) == assignmentsById(replaced);
    mapping.Schedule.ReplacePeriod([]);
    var history = request.Document.Assignments.Where(a => !mapping.Schedule.Period.ContainsStart(new(a.Start, a.End))).ToArray();
    var preserveExternalHistory = assignmentsById(history) == assignmentsById(mapping.ToDocument().Assignments);
    return new { analysis, validation,
        inputUnchanged = before == JsonSerializer.Serialize(request, options),
        migrationIdempotent = before == migrated,
        roundTripPreserved, preserveReplacement, preserveExternalHistory };
}).ToArray();
Console.Write(JsonSerializer.Serialize(results, options));
string assignmentsById(IReadOnlyList<ShiftAssignment> shifts) => JsonSerializer.Serialize(shifts.OrderBy(a => a.Id), options);
