using System.Reflection;
using System.Text.Json;
namespace EscalaLivre.Application.Contracts;

public static class DocumentValidationLimits
{
    private static readonly IReadOnlyDictionary<string,int> Values = Read();
    public static int Text => Values["text"];
    public static int TimeZone => Values["timeZone"];
    public static int Employees => Values["employees"];
    public static int Assignments => Values["assignments"];
    public static int Coverage => Values["coverage"];
    public static int Roles => Values["roles"];
    public static int Holidays => Values["holidays"];
    public static int Days => Values["days"];
    public static int Windows => Values["windows"];
    public static int Preferences => Values["preferences"];
    public static int CoverageRoles => Values["coverageRoles"];
    public static int Tags => Values["tags"];
    public static int PreferenceWeight => Values["preferenceWeight"];
    public static int WorkUnits => Values["workUnits"];
    public static int WeeklyHours => Values["weeklyHours"];
    public static int MinimumRestSeconds => Values["minimumRestSeconds"];
    public static int MaximumRestSeconds => Values["maximumRestSeconds"];
    public static int ShiftDurationSeconds => Values["shiftDurationSeconds"];
    public static int LunchSeconds => Values["lunchSeconds"];
    public static int PreferredAfterSeconds => Values["preferredAfterSeconds"];
    public static int AssignmentSeconds => Values["assignmentSeconds"];
    private static IReadOnlyDictionary<string,int> Read()
    {
        using var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("EscalaLivre.DocumentValidationLimits")!;
        return JsonSerializer.Deserialize<Dictionary<string,int>>(stream)!;
    }
}
