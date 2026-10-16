namespace EscalaLivre.Domain.Regimes;

public sealed class ShiftRegimeFactory
{
    private readonly IReadOnlyDictionary<string, IShiftRegime> regimes = new IShiftRegime[]
    {
        new DayBasedRegime(),
        new HourBasedRegime()
    }.ToDictionary(x => x.Type, StringComparer.OrdinalIgnoreCase);

    public IShiftRegime Resolve(string type)
        => regimes.TryGetValue(type, out IShiftRegime? regime)
            ? regime
            : throw new InvalidOperationException($"Regime '{type}' is not supported.");
}
