namespace EscalaLivre.Domain.Regimes;

public sealed class ShiftRegimeFactory
{
    private readonly IReadOnlyDictionary<string, IShiftRegime> regimes;

    public ShiftRegimeFactory(IEnumerable<IShiftRegime> strategies)
    {
        ArgumentNullException.ThrowIfNull(strategies);
        var registered = new Dictionary<string, IShiftRegime>(StringComparer.OrdinalIgnoreCase);
        foreach (var strategy in strategies)
        {
            if (strategy is null || string.IsNullOrWhiteSpace(strategy.Type))
                throw new ArgumentException("Regime registrations need a nonempty type.", nameof(strategies));
            if (!registered.TryAdd(strategy.Type, strategy))
                throw new ArgumentException($"Regime '{strategy.Type}' is registered more than once.", nameof(strategies));
        }
        regimes = registered;
    }

    public IShiftRegime Resolve(string type)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(type);
        return regimes.TryGetValue(type, out var regime) ? regime
            : throw new InvalidOperationException($"Regime '{type}' is not supported.");
    }
}
