# ADR 006 — Políticas canônicas e contratos parciais de regime

Data: 26/10/2026. Estado: implementada na etapa 4; sem mudança de regra de escala.

## Decisão e alcance

EffectiveWorkPolicy mede trabalho civil líquido, herança da jornada, limite diário e repartição semanal. RestPolicy distingue o mínimo exclusivo do regime em horas do máximo entre empresa/regime usado pela escala. DayCyclePolicy conta datas iniciais distintas em janelas móveis, sem fase inventada. IntervalPolicy reúne obrigatoriedade, pausa fixa, fechamento e limites variáveis. AvailabilityPolicy exige uma janela contendo o turno inteiro e veda qualquer restrição sobreposta. ShiftEligibilityPolicy reúne permissões de calendário, expediente, entrada fixa e noite. Estas políticas leem projeções; não constroem agregados nem rejeitam arquivos conflitantes.

ScheduleRules mantém a redação e a ordem dos diagnósticos e delega predicados/cálculos às políticas. LaborRules e ScheduleWindow conservam helpers de compatibilidade por delegação. O adaptador usa as políticas de descanso, ciclo e limite em horas, sem decompor o modelo, alterar pesos/grades ou tratar D1. O frontend possui módulos correspondentes em lib/policies; laborRules mantém exports compatíveis e a montagem dos diagnósticos. São implementações distintas, verificadas por fixtures, não compartilhamento binário.

## Contrato de IShiftRegime

Entrada: tempos civis com precisão de segundos, configuração estruturalmente válida e correspondente à estratégia; pausa estruturalmente válida quando presente; histórico completo da mesma pessoa nos dois lados, excluindo a atribuição sendo editada. As capacidades são puras e não alteram janela, pausa, regra ou histórico. O registro Type é estável e não vazio. Implementações registradas como singleton devem ser sem estado mutável.

CanWork retorna false para uma janela não positiva. Para entradas válidas, responde somente às restrições do regime; a ordem do histórico e a repetição de uma mesma atribuição não mudam a decisão. Não promete descanso da empresa, jornada configurada, disponibilidade, intervalo obrigatório, limite diário/semanal, permissões nem cobertura. Um true não autoriza gravar/gerar sem o avaliador completo.

| Capacidade | dayBased | hourBased |
| --- | --- | --- |
| Jornada líquida | Não impõe limite de horas nesta capacidade | Desconta pausa; aceita igualdade em workUnits horas |
| Histórico | No máximo workUnits datas iniciais distintas em toda janela de workUnits + restUnits dias que contém a candidata | Descanso restUnits horas dos dois lados de cada turno; igualdade aceita |
| Duplicação | Datas repetidas não consomem dias adicionais | Repetir a mesma comparação não muda a decisão |
| Estimativa local | Mantém hora/segundo; soma max(1, restUnits) dias | Soma restUnits horas |

GetNextEligibleStart foi substituído por **EstimateStartAfterRest** em todos os consumidores C#. Não há endpoint/JSON com esse nome. A aritmética anterior foi preservada, inclusive avanço de um dia em dayBased com zero repouso. Uma estimativa pode ser recusada pelo histórico futuro; nem é a primeira entrada admissível, nem um certificado de elegibilidade. Corrigir essa aritmética ou ampliar o escopo de CanWork exige decisão/cenário separado.

## Resolução e composição

ShiftRegimeFactory recebe IEnumerable<IShiftRegime>, captura o registro em um dicionário privado e não instancia implementações concretas. API.AddScheduleAnalysis registra DayBasedRegime, HourBasedRegime e o resolvedor. Testes de composição resolvem uma terceira estratégia registrada sem editar o resolvedor ou seu consumidor genérico. Não se acrescentou um framework de plugins ou tipo público de regime.

- Resolução preserva comparação ordinal sem diferenciar maiúsculas/minúsculas; não remove espaços de um tipo.
- Tipo desconhecido não vazio: InvalidOperationException com a mensagem anterior. Registro vazio é permitido, mas qualquer resolução falha como desconhecida.
- Coleção ou tipo de resolução null: ArgumentNullException. Tipo de resolução vazio/branco: ArgumentException.
- Estratégia null, Type vazio/branco ou registro duplicado (também por diferença de caixa): ArgumentException na construção do resolvedor, inclusive ao resolvê-lo por DI. Não escolhe o primeiro/último silenciosamente.
- DocumentSafety continua aceitando somente dayBased/hourBased canônicos no transporte. Regime desconhecido na empresa ou pessoa recebe HTTP 400/envelope de falha antes do worker. Registrar uma estratégia não amplia o schema: adicionar um regime de produto ainda exige configuração tipada, validação, tradução matemática e paridade próprias.

O diagnóstico e as estratégias compartilham políticas; o diagnóstico não é substituído pelo contrato parcial de CanWork. O solver já filtrava por ShiftDiagnostics e continua assim. Não passar toda a geração pelo resolvedor nesta etapa evita promover o contrato parcial a validação global e antecipar a etapa 5.

## Evidência e consequências

Os 20 contratos de [regimes](../../shared/regime-contract-scenarios.json) passam nas implementações anteriores isoladas e nas novas. A mesma fixture verifica TypeScript. Os 58 documentos e hashes completos anteriores são preservados; diagnóstico, cobertura, lacunas, pontuação e HTTP continuam verificados. Casos de disponibilidade, intervalo, descanso máximo, maior fim anterior e limites semanais permanecem nos cenários existentes.

O [ADR 004](004-conflicting-documents-and-known-divergences.md) continua válido: contratos parciais são agora explícitos; D1 não foi corrigida. Nenhuma nova divergência de negócio foi comprovada. Evidências operacionais, ajuste separado do teste de deadline e pendências estão no [relatório](stage-4-domain-policies.md).

Seguimento de consolidação: [ADR 008](008-final-boundaries-and-validation.md) e [revisão final](stage-6-final-review.md). Nomes/estados anteriores neste registro são históricos.

## Seguimento — precondições verificadas

No [ADR 009](009-validated-operational-boundaries.md), as estratégias embutidas mapeiam explicitamente WorkloadRule para DayCycleConfiguration/HourCycleConfiguration e rejeitam configurações do outro regime com ArgumentException, inclusive na estimativa. O contrato comum permanece aberto para estratégias registradas; o resolvedor não ganhou condicionais nem instanciações. Os consumidores operacionais de ciclo/capacidade agora exigem unidades tipadas. Sob entradas válidas, os 20 contratos compartilhados e a aritmética de estimativa (inclusive avanço mínimo legado em dias) permanecem iguais.
