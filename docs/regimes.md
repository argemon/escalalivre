# Regimes

O dominio define `IShiftRegime` para evitar hardcode de formatos especificos.

## Day-based

Regimes como 5x2, 6x1 e 4x3 sao configurados por:

- dias trabalhados (`workUnits`)
- dias de folga (`restUnits`)

## Hour-based

Regimes como 12x36 e 24x72 sao configurados por:

- horas trabalhadas (`workUnits`)
- horas de descanso (`restUnits`)

## Extensao

Novos regimes devem implementar `IShiftRegime` e ser registrados em `ShiftRegimeFactory`. O solver recebe regras configuraveis e nao conhece nomes fixos como 5x2 ou 12x36.
