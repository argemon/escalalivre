# Regimes

O dominio define `IShiftRegime` para evitar hardcode de formatos especificos.

## Day-based

Regimes como 5x2, 6x1 e 4x3 sao configurados por:

- dias trabalhados (`workUnits`)
- dias de folga (`restUnits`)

O ciclo limita datas de início trabalhadas em qualquer janela móvel de
`workUnits + restUnits` dias. Não impõe um bloco consecutivo de trabalho seguido
de outro bloco de folgas. O histórico anterior e posterior ao período participa
da verificação.

### Seleção individual 5x2 e 6x1

No cadastro do funcionário, **Escala do funcionário** permite selecionar 5x2,
6x1, ciclo personalizado ou o padrão da empresa. A escala individual não obriga
a pessoa a trabalhar em todos os dias de funcionamento da empresa.

Com dias automáticos, `weeklyPlan.flexibleWorkDays` permite ao gerador escolher
datas e horários junto com a cobertura, respeitando carga, ciclo, disponibilidade,
pausas e descanso. Com dias fixos, a distribuição diária anterior é mantida.
Falta de demanda ou restrições podem impedir completar a carga; o saldo permanece
visível, separado das folgas. Escolher um modelo não altera turnos já salvos.

Os avisos da transição da EC 141/2026 orientam a revisão de quantidade de repousos
e carga normal conforme o período planejado, sem converter contratos ou aplicar
exceções coletivas automaticamente. Semântica, prazos e compatibilidade estão na
[decisão sobre escalas individuais](decisions/020-individual-weekly-patterns.md).

## Hour-based

Regimes como 12x36 e 24x72 sao configurados por:

- horas trabalhadas (`workUnits`)
- horas de descanso (`restUnits`)

## Extensao

`IShiftRegime` fornece uma capacidade parcial de elegibilidade, registrada na
composição de `ShiftRegimeFactory`. Um regime novo também precisa declarar suas
capacidades e integrar diagnóstico, candidatos e tradução das restrições; somente
registrar uma estratégia não amplia o contrato público, hoje fechado em
`dayBased` e `hourBased`. Consulte as [fronteiras de extensibilidade](decisions/010-regime-extension-boundaries.md).
