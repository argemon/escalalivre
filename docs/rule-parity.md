# Regras de geração e validação

O diagnóstico local (`frontend/src/lib/laborRules.ts`) e o domínio C# (`backend/EscalaLivre.Domain/Scheduling/ScheduleRules.cs`) implementam o mesmo contrato. `/analyze` e `/validate` usam o mesmo diagnóstico; `/solve` filtra candidatos por esse diagnóstico e acrescenta as restrições coletivas ao modelo e reavalia sua proposta completa antes de aplicar. Nenhuma dessas operações corrige um turno salvo para esconder um conflito.

## Inventário e decisões

| Regra | Contrato adotado | Diagnóstico |
| --- | --- | --- |
| Identidade e função | Pessoa deve existir; função do turno deve ser a principal da pessoa. Normalizar não substitui a função do turno pela da pessoa. | `unknownEmployee`, `invalidShift` |
| Duração válida | Fim posterior ao início; pausa positiva, estritamente interna, com trabalho antes e depois. | `invalidShift`, `interval` |
| Intervalo obrigatório | Trabalho efetivo até 4h dispensa pausa; acima de 4h exige 15min; acima de 6h exige 1h; máximo de 2h. Trabalho efetivo desconta a pausa. | `interval` |
| Intervalo variável | Mínimo é o maior entre o mínimo da empresa, o obrigatório pela jornada e a duração do fechamento atravessado. Máximo é limitado a 2h; mínimo obrigatório prevalece sobre máximo menor configurado na empresa. | `interval` |
| Intervalo fixo | Horários devem coincidir exatamente com o intervalo da pessoa, inclusive a data. Início da pausa menor ou igual ao início do turno pertence ao dia seguinte; fim menor ou igual ao início da pausa pertence ao dia seguinte. Substitui os limites variáveis da empresa, preservando os limites obrigatórios da jornada. | `fixedInterval`, `interval` |
| Fechamento para almoço | Pausa deve cobrir todo o fechamento atravessado. Inclui o fechamento da operação iniciada no dia anterior. Quem trabalha durante o fechamento deve manter sua pausa fora dele; essa opção não dispensa pausa obrigatória. | `middayClosure` |
| Jornada configurada | Trabalho efetivo não pode exceder `defaultShiftDuration`, herdado da empresa ou próprio da pessoa. | `workload` |
| Regime em horas | Trabalho efetivo, descontada a pausa, não pode exceder `workUnits`. Descanso usa o maior entre `restUnits` em horas e o mínimo da empresa. | `regime`, `minimumRest` |
| Limite diário | Soma do trabalho efetivo dos turnos com início na mesma data: 8h ou 10h quando a pessoa permite horas extras. A configuração de horas extras não amplia automaticamente a jornada nem o regime. | `dailyLimit` |
| Um turno por dia | No máximo um turno por pessoa e data de início. Um turno noturno pertence inteiro à data de início para essa regra e para substituição. | `multipleShifts` |
| Limite semanal | Semana civil de domingo a sábado. Divide o trabalho e a pausa na meia-noite de domingo, considerando o histórico dos dois lados do período. | `weeklyLimit` |
| Disponibilidade | Quando informada, uma única janela deve conter o turno inteiro, incluindo a pausa. Janelas adjacentes não são unidas implicitamente. | `availability` |
| Restrições de horário | Qualquer sobreposição com o turno, inclusive durante a pausa, bloqueia o turno. Encostar no início/fim é permitido. | `availability` |
| Descanso | Intervalo entre fim e próximo início; verifica todos os turnos, inclusive sobrepostos e histórico anterior e posterior. O diagnóstico considera o maior fim anterior, não só o último início. Igualdade com o mínimo é permitida. | `minimumRest` |
| Regime em dias | Em qualquer janela móvel de `workUnits + restUnits` dias, no máximo `workUnits` datas distintas com início de turno. Sem uma fase de ciclo persistida, não se inventa uma âncora. Histórico posterior também restringe a geração. | `regime` |
| Dias de trabalho | Dias pessoais valem quando a pessoa não herda os padrões da empresa. Dias de operação da empresa valem salvo autorização específica. | `workingDay` |
| Expediente | Turno deve caber na união das janelas reais de operação, incluindo operações noturnas do dia anterior. Cobertura com autorização ou turno autorizado de feriado pode permitir a exceção, registrada como informação. | `outsideHours` |
| Feriados | Feriado fechado remove demanda normal e bloqueia turnos comuns. Autorização de feriado excepciona expediente, não disponibilidade, descanso, jornada ou pausa. | `holiday`, `outsideHours` |
| Entrada fixa | Início deve coincidir com `shiftStartsAt` na data do turno. | `fixedStart` |
| Trabalho noturno | Sem permissão, início antes de 06h ou fim depois de 22h da data de início é inválido. | `nightWork` |
| Cobertura por função | Substituição é direcional; a mesma pessoa não cobre duas exigências de função simultaneamente. Cobertura por equipe conta pessoas elegíveis. Sobreposições da mesma pessoa não duplicam sua capacidade. | Blocos de cobertura e lacunas |
| Pausas e cobertura | Pausa não fornece cobertura; fechamento remove demanda normal, mantendo exigências explicitamente autorizadas fora do expediente. Limites de turnos, pausas e exigências subdividem os blocos. | Blocos de cobertura e lacunas |
| Pontuação | Minutos cobertos ponderados pela quantidade exigida / minutos exigidos; arredondamento de 3 casas. Lacunas consecutivas da mesma função e déficit são agrupadas. | `coverageScore`, `gaps` |

`Lunch.PreferredAfter`, dias de folga preferidos, pesos de preferências e preferência por abertura/fechamento orientam a escolha do gerador; não tornam um documento inválido. A geração procura entradas e pausas em passos discretos e possui limites de tempo e complexidade: validação de um documento não implica que o gerador consiga reproduzir exatamente seus horários. Uma falha de geração conserva os dados anteriores.

A validação estrutural de importação/API é uma etapa anterior: tipos, referências, limites de tamanho e faixas de valores não são diagnósticos de escala. O período de planejamento determina a demanda e a substituição; o documento completo fornece o histórico das restrições.

## Normalização, migração e edição

`changed()` foi removida. O ciclo de vida fica explícito em `frontend/src/lib/documentLifecycle.ts`:

- `normalizeDocument`: normaliza referências de funções; não converte datas, recalcula fim, insere pausa ou altera horários de turnos.
- `migrateDocument`: converte formatos legados e devolve as migrações aplicadas. Identificadores: `company-time-zone-v1`, `qualified-times-to-company-civil-v1`, `schedule-second-precision-v1`, `explicit-planning-period-v1` e `utc-update-instant-v1`. Rodar novamente é idempotente.
- `replaceAssignment` e ações explícitas do store: criação, edição, movimento e exclusão. Alterar regras da empresa ou da pessoa recalcula diagnósticos, preservando início, fim e pausa existentes. Alterar a função da pessoa atualiza a função de seus turnos como parte dessa edição explícita.

`intervalFor` constrói pausas para novos turnos manuais e prévias. Não participa da normalização nem da recuperação de turnos existentes. Importações e restaurações passam pela migração identificada e validação estrutural antes de entrar no estado. A análise pode converter a representação em uma cópia temporária para leitura; não escreve horários no documento recebido.

Datas de escala usam tempo civil da empresa. A aritmética em `civilTime.ts` é independente do fuso do dispositivo e de seu horário de verão. Veja também [contrato de datas](date-time.md), [preservação de turnos](generation-preservation.md) e [recuperação](recovery.md).

## Cenários compartilhados e verificação

`shared/rule-scenarios.json` contém 58 documentos com códigos esperados. Abrange limites de pausa, intervalo fixo, fechamento, jornadas líquidas, disponibilidade, descanso, ciclo, semana, feriados, entrada fixa, função e mudança de horário de verão no dispositivo. Os cenários de geração delimitam disponibilidade para isolar a regra em teste sem depender da busca de uma operação aberta 24h.

- `frontend/tests/rules.test.cjs` verifica os códigos esperados, imutabilidade dos documentos, normalização idempotente, migração identificada e preservação de horários ao editar configurações.
- `backend/EscalaLivre.Adapter.Tests/SharedRulesTests.cs` lê o mesmo arquivo, compara os casos de uso independentes de análise e validação e revalida as escalas geradas.
- `backend/EscalaLivre.Analysis.Tests/AnalysisContractTests.cs` executa os casos de uso de análise/validação sem Infrastructure/OR-Tools e compara a resposta completa com hashes capturados antes da extração da etapa 2.
- `backend/security.integration.cjs` envia esses documentos à API real, passando pelo worker. Compara frontend, `/analyze` e `/validate` por código, gravidade, pessoa, início, fim e função; compara também todos os blocos de cobertura, lacunas e pontuação. Para os cenários de geração, compara `/solve` com a análise local da escala retornada. A redação traduzida das mensagens não integra esse contrato.

Comandos na raiz do repositório:

```powershell
node --test frontend/tests/rules.test.cjs
dotnet test backend/EscalaLivre.Analysis.Tests/EscalaLivre.Analysis.Tests.csproj -c Release
dotnet test backend/EscalaLivre.Adapter.Tests/EscalaLivre.Adapter.Tests.csproj -c Release
dotnet test backend/EscalaLivre.Api.Tests/EscalaLivre.Api.Tests.csproj -c Release
dotnet test backend/EscalaLivre.Architecture.Tests/EscalaLivre.Architecture.Tests.csproj -c Release
dotnet build backend/EscalaLivre.Api/EscalaLivre.Api.csproj -c Release
$env:SECURITY_BUILD_CONFIGURATION='Release'
node --test backend/security.integration.cjs
```

Para verificar independência do fuso do dispositivo, execute os testes frontend também com `$env:TZ='America/New_York'`.

## Auditoria de caracterização — etapa 1 (23/10/2026)

O [baseline e mapa de regras](decisions/stage-1-baseline-and-rule-map.md) registra verificações, duplicações e limites das evidências. Nove cenários novos cobrem segundos, janelas adjacentes, descanso anterior/posterior, maior fim anterior e lacuna de cobertura de um segundo.

Foi reproduzida D1: com dois turnos históricos sobrepostos da mesma pessoa, o modelo pode contar duas atribuições para cobertura de equipe; a análise conta uma pessoa e devolve a lacuna. O [ADR 004](decisions/004-conflicting-documents-and-known-divergences.md) registra entrada/saída e correção futura. O contrato de capacidade por pessoa permanece; esta entrega caracteriza a implementação, sem alterar regra/modelo. A auditoria também demonstra que CanWork/GetNextEligibleStart dos regimes têm alcance parcial e não são usados pelo solver atual.

## Extração preservando regras — etapa 2 (26/10/2026)

ScheduleEvaluator em Domain usa o diagnóstico canônico de ScheduleRules, ScheduleCoverage, HiringDemand e ScheduleSuggestions. AnalyzeSchedule e ValidateSchedule consomem o mesmo IScheduleAnalyzer; GenerateSchedule usa IScheduleOptimizer e reavalia o documento completo antes de montar o resultado em Application. A avaliação continua relatando conflitos herdados, sem nova política de rejeição. CoverageDemand é usado pelo avaliador e pelo modelo, com a semântica anterior.

Os 58 resultados de leitura completos preservam os hashes da implementação anterior; as 15 integrações HTTP passaram com o worker adaptado. D1 continua reproduzida: mover os cálculos de demanda não corrige a multiplicidade das variáveis do modelo. Nenhuma regra, peso, granularidade ou código de diagnóstico foi alterado. Veja [relatório e pendências](decisions/stage-2-analysis-extraction.md).

## Tipos e agregados sem alteração de regra — etapa 3 (26/10/2026)

Os novos tipos de Domain.Planning protegem estrutura e identidade; não transformam descanso, jornada ou pausa obrigatória em condição para carregar/editar uma escala. Pausas positivas contidas que tocam uma borda continuam representáveis e recebem interval. DTOs explícitos e mapeadores em Application preservam o formato público; ScheduleModels permanece projeção de compatibilidade para consumidores ainda não migrados.

GenerateSchedule aplica substituição pelo agregado e confere todo o histórico externo antes de avaliar o resultado. Essa conferência é estrutural; D1 e a rejeição de novas violações obrigatórias da etapa 5 continuam pendentes. Não se alteraram cenários, hashes, políticas de diagnóstico, pesos, discretização ou limites do solver. Os comandos internos de configuração/edição preservam horários, com atualização explícita da função da pessoa conforme o contrato existente. Veja [decisão](decisions/005-validated-planning-and-transport.md) e [verificações](decisions/stage-3-protected-planning.md).

## Matriz atualizada — etapa 4 (26/10/2026)

A semântica da tabela inicial permanece. Esta matriz atualiza a localização das 26 famílias do [inventário histórico](decisions/stage-1-baseline-and-rule-map.md). As evidências de fronteira nomeadas nesse inventário continuam executadas; os 58 documentos originais permanecem iguais e suas respostas completas mantêm os hashes anteriores. O prefixo TS policies/ significa frontend/src/lib/policies/. Predicados não são validação estrutural de importação.

| ID | Família | Política C# atual | Equivalente TS | Diagnóstico/tradução/limite |
| --- | --- | --- | --- | --- |
| R01 | Identidade/função | ScheduleRules; DocumentSafety | laborRules; documentSchema | invalidShift/unknownEmployee; filtro canônico |
| R02 | Janela/pausa estrutural | Planning.CivilWindow/ShiftPause; IntervalPolicy.Valid | documentSchema; policies/interval | invalidShift/interval; conflitos continuam carregáveis |
| R03 | Intervalo obrigatório | IntervalPolicy.Required/Valid | policies/interval.requiredBreakMinutes/intervalIssue | interval; filtro de candidatos |
| R04 | Intervalo variável | IntervalPolicy.VariableLimits | policies/interval.variableIntervalLimits | interval; gerador mantém busca discreta |
| R05 | Intervalo fixo | IntervalPolicy.FixedBreak | policies/interval.fixedBreak | fixedInterval; gerador mantém construção de pausas |
| R06 | Fechamento | IntervalPolicy.ClosureOn/Closures/ConflictsWithClosure | policies/interval | middayClosure; demanda em CoverageDemand |
| R07 | Jornada/regime em horas | EffectiveWorkPolicy.Measure/RuleFor/ExceedsHourRegime; HourBasedRegime | policies/effectiveWork | workload/regime; limite de candidato |
| R08 | Jornada diária/um turno por dia | EffectiveWorkPolicy.DailyLimit; ScheduleRules.Diagnose | policies/effectiveWork; laborRules | dailyLimit/multipleShifts; exclusividade no modelo |
| R09 | Semana civil e pausa repartida | EffectiveWorkPolicy.WorkTicksInWeek; ScheduleWindow.Weeks | policies/effectiveWork.workMillisInWeek; civilTime | weeklyLimit; soma ponderada no modelo |
| R10 | Disponibilidade inteira | AvailabilityPolicy.Allows | policies/availability.isAvailable | availability; filtro; não unir janelas |
| R11 | Restrições, inclusive pausa | AvailabilityPolicy.Allows | policies/availability.isAvailable | availability; sobreposição estrita |
| R12 | Descanso bilateral/maior fim | RestPolicy.Required/CanFit/ViolatesPrevious/Conflicts | policies/rest | minimumRest; HourBasedRegime usa só descanso do regime |
| R13 | Ciclo móvel/datas distintas | DayCyclePolicy; DayBasedRegime | policies/dayCycle | regime; soma de variáveis menos datas preservadas |
| R14 | Dias de trabalho | ShiftEligibilityPolicy.IsWorkingDay | policies/eligibility.isWorkingDay | workingDay; filtro de calendário |
| R15 | Expediente/exceções | ShiftEligibilityPolicy.OutsideHours/HasOperatingException | policies/eligibility | outsideHours; info quando autorizado |
| R16 | Feriados | LaborRules.ClosedHoliday/AuthorizedHolidayShift | holidays | holiday; CoverageDemand/candidatos/autorizados |
| R17 | Entrada fixa/noite | ShiftEligibilityPolicy.MatchesFixedStart/IsNight | policies/eligibility | fixedStart/nightWork; filtro/entradas fixas |
| R18 | Substituição direcional | ScheduleRules.CanCover; ScheduleCoverage | coverageAllocation | alocação por pessoa; CoverageConstraints corrigido na etapa 5 |
| R19 | Capacidade por pessoa | ScheduleCoverage | coverageAllocation | blocos/lacunas; D1 corrigida e coberta em C#/TS/HTTP |
| R20 | Pausa sem cobertura/bordas | CoverageDemand; ScheduleCoverage | analysis; coverageAllocation | blocos/lacunas; modelo compartilha demanda |
| R21 | Pontuação/agrupamento de lacunas | ScheduleCoverage | analysis | coverageScore/gaps; hashes completos e HTTP |
| R22 | Período/histórico/substituição | PlanningSchedule; ScheduleWindow; PlanningDocumentMapping | planningPeriod; scheduleWindow; store | histórico bilateral; round-trip e geração |
| R23 | Tempo civil/migração | ScheduleJson; DTOs/mapeadores; Planning | civilTime; documentLifecycle | segundos; migrações idempotentes; teste em NY |
| R24 | Preferências | ScheduleObjective | edição de preferências | não são erro de validade; objetivo inalterado |
| R25 | Limites operacionais da busca | ScheduleCandidateGenerator; OptimizationBudget; OrToolsExecution | api; queuedSolve | grade/orçamento/CP-SAT inalterados; componentes extraídos |
| R26 | Falha/cancelamento/worker | CalculationWorker; ScheduleJobQueue | api; queuedSolve; store | envelopes/preservação; integração HTTP |

Os 20 novos [contratos compartilhados de regime](../shared/regime-contract-scenarios.json), separados dos documentos de ponta a ponta, cobrem jornada líquida/segundo, descanso bilateral, duplicação/ordem do histórico, ciclo móvel atravessando ambos os lados e alcance parcial. Passaram também contra cópias dos regimes originais. RegimeContractTests executa-os no projeto puro; regime-contracts.test.cjs usa as políticas TS correspondentes. Os 58 cenários anteriores mantêm disponibilidade, intervalo, fechamento, semana, autorizações, histórico e cobertura verificados em TS/C#/HTTP.

Contrato de registro, tipos desconhecidos/duplicados e EstimateStartAfterRest: [ADR 006](decisions/006-scheduling-policies-and-regime-contracts.md). O avanço mínimo legado do regime em dias não foi corrigido. D1 continua separada da refatoração e bloqueia afirmar equivalência global entre cobertura do modelo e análise. Não foi identificada outra divergência comprovada nesta etapa.

## Geração e admissão — etapa 5 (26/10/2026)

As referências a D1 pendente nas seções históricas descrevem o estado das etapas 1–4. D1 foi corrigida separadamente da extração: CoverageConstraints soma presenças distintas por pessoa/bloco, com uma única alocação simultânea entre funções direcionais. O OR das atribuições preserva a capacidade quando uma delas está em pausa e outra cobre o bloco, exatamente como a análise por pessoa. Os dois turnos históricos conflitantes continuam no documento e nos diagnósticos.

Os dois [cenários novos](../shared/solver-regression-scenarios.json) reproduzem equipe e funções: o tradutor anterior retorna score 0,5; o corrigido acrescenta a pessoa disponível e retorna score 1. C#, TypeScript e HTTP verificam o contrato. TS já implementava capacidade por pessoa; só foram adicionadas evidências. Os 58 documentos/hashes e os 20 contratos de regimes anteriores permanecem iguais.

GenerateSchedule avalia a proposta canonicamente e não aplica novas violações obrigatórias. GenerationConformance usa apenas o histórico idêntico retido para identificar herança e verifica participação de trabalho novo em erros agregados, inclusive com código/janela inalterados. Um novo erro retorna invalid/solverInvalid e os turnos originais. Lacunas de cobertura continuam admitindo escala parcial; preferências continuam na função objetivo. A rejeição do lote não altera horários para fazê-lo passar.

Traduções R08–R13: DailyExclusivityConstraints, RestConstraints, WeeklyWorkConstraints e DayCycleConstraints, apoiadas em EffectiveWorkPolicy/RestPolicy/DayCyclePolicy/ScheduleCapacityPolicy. R18–R20: CoverageConstraints + CoverageDemand/ScheduleCoverage; R24: ScheduleObjective; R25: gerador/orçamento/executor; R26: GenerateSchedule + supervisor/worker anteriores. A matriz de 26 famílias acima mantém o restante da rastreabilidade. Contratos completos: [ADR 007](decisions/007-optimization-translators-and-admission.md); resultados: [relatório](decisions/stage-5-optimization-adapter.md).

## Consolidação final — etapa 6

As fachadas e delegações temporárias foram removidas após comprovar os mesmos 581 casos migrados. O diagnóstico usa as políticas diretamente; a construção de pausas TS usa limites canônicos. A matriz continua com 26 famílias e os 58 documentos/hashes, 20 contratos e dois casos D1 inalterados. Testes atuais: [guia](testing.md); limites, CI pendente e evidências: [revisão final](decisions/stage-6-final-review.md). Relatos de fachadas/D1 pendente em seções datadas anteriores são históricos.

## Fronteiras operacionais tipadas — seguimento de 26/10/2026

O [ADR 009](decisions/009-validated-operational-boundaries.md) não altera regra de jornada, descanso, ciclo ou cobertura. Configurações operacionais entram em PlanningSettings/RegimeConfiguration; tradutores distinguem dias, duração e horas semanais. A conversão de horas fracionárias para ticks mantém floor, mas falha explicitamente no overflow em vez de produzir um limite negativo. Estratégias C# embutidas rejeitam regra de outro regime antes de interpretar unidades. Essas entradas já eram estruturalmente rejeitadas pelo transporte; a proteção foi estendida a chamadas internas, sem ampliar/restringir o JSON aceito.

A geração aceita é aplicada por ReplacePeriod e exportada em coleção/tags imutáveis; alterar buffers do adaptador não modifica o resultado validado. A preservação pública é por conteúdo integral, não por identidade de referências C#. Projeções/DTOs continuam com primitivos. Documentos com conflitos de negócio, incluindo pausas nas bordas, histórico sobreposto e excesso de jornada, continuam carregáveis e diagnosticáveis. Os 58 hashes de análise, 20 contratos de regime e dois cenários D1 existentes não foram alterados. TypeScript não precisou mudar: as regras válidas e o transporte mantêm a mesma semântica; a mutabilidade corrigida era interna à geração C#.

## Extensibilidade por capacidades — 27/10/2026

O [ADR 010](decisions/010-regime-extension-boundaries.md) organiza a mesma semântica por capacidades: limite de trabalho efetivo, descanso do regime e limite móvel de datas iniciais. DayCycleConfiguration fornece somente ciclo; HourCycleConfiguration fornece trabalho e descanso. Ausência de descanso do regime não equivale a descanso explicitamente zero: a capacidade parcial em dias continua sem verificar sobreposição, enquanto a de horas com zero ainda a rejeita. O diagnóstico global continua impondo descanso da empresa, exclusividade diária e demais políticas.

C# e TS consomem essas definições sem comparar nomes de regimes em cada consumidor. Mantidos códigos, textos/ordem dos diagnósticos, estimativa legada, segundos, histórico bilateral e os 58 hashes/20 contratos/cenários D1. Não houve novo regime, campo JSON, migração, peso, prazo ou limite de produção. Novas famílias de regras exigirão decisão de paridade, diagnóstico, participação na admissão e tradução próprios; registro de IShiftRegime isolado não satisfaz esse contrato.

## Decisão D2 — autoridade da autorização direcional (27/10/2026)

Reprodução anterior à correção: uma pessoa Principal, um turno 08:00:00–08:00:01 e uma exigência Suporte no mesmo segundo, com coverageRoles=[Suporte] e coverageRoleIds=[]. C# contava uma pessoa/score 1; TS contava zero/score 0 e uma lacuna. Remover o turno ou a exigência elimina a divergência; remover a pessoa invalida a referência. A janela de um segundo é a menor precisão do contrato. O caso está em explicit-empty-ids-revoke-stale-names do [corpus diferencial](../shared/parity-corpus.cjs); a [evidência anterior](decisions/evidence/parity/before-fix-revocation.json) preserva entrada e saídas.

Decisão registrada antes da alteração: a lista de IDs explícita, inclusive vazia, é autoritativa. Substituição exige o ID da função demandada nessa lista; nomes antigos não restauram autorização revogada. Quando a lista está ausente, nomes legados continuam aceitos. Função principal e escopo de equipe mantêm o contrato anterior. Não se exige regravar documentos nem alterar horários, JSON, pesos ou limites do gerador. A correção deve aplicar o mesmo predicado a diagnóstico/alocação e filtros/tradução C#, e ao TS; testes cobrem revogação, autorização somente por ID e legado sem IDs, antes e depois da migração.

## Verificação diferencial determinística — 27/10/2026

A revisão da matriz encontrou lacunas de combinação e de representação, sem substituir as evidências anteriores. Os 58 documentos e seus hashes, os 20 contratos dos regimes e os dois casos D1 continuam intactos. Acrescentados 12 [documentos de fronteira](../shared/parity-boundaries.json), executados em C#, TS e HTTP/worker, e 72 variações reproduzíveis (24 por semente). O comparador puro também executa os 58 originais: 142 entradas por fuso.

| Famílias | Lacuna tratada | Evidência adicional |
| --- | --- | --- |
| R09/R12/R22 | Combinar histórico anterior/posterior com excesso semanal; pausa repartida na virada de domingo, igualdade e um segundo acima | bilateral-history-and-aggregate-week; sunday-split-pause-at-midnight; sunday-split-pause-one-second-over; variações de descanso 11h, 11h+1s, 12h e 24h |
| R18 | Autorização por IDs sem nomes, legado sem IDs e revogação com nomes obsoletos | directional-forward/reverse; directional-ids-without-transport-names; directional-legacy-names-without-ids; explicit-empty-ids-revoke-stale-names (D2) |
| R19/R20 | Disputa entre funções e turnos sobrepostos da mesma pessoa; pausa de um segundo dentro da demanda | directional-roles-compete-for-one-person; overlap-is-one-person; pause-one-second-and-touching-boundaries |
| R21 | Arredondamento ponderado no meio de um milésimo, além de blocos e lacunas completos | weighted-score-half-thousandth: um segundo coberto por uma pessoa / 2000 segundos de pessoa exigidos = 0,0005, arredondado a 0,001 |
| R02/R08/R09/R12/R13 | Conflitos individuais e agregados coexistindo, nos regimes em dias e horas | sementes fixas combinam sobreposição, jornadas, descanso, ciclo e limites semanais; códigos e janelas inteiros são comparados |
| R22/R23 | Migração repetida e substituição não podem reescrever turnos nem histórico bilateral | round-trip C#, migração TS duas vezes sem migrações restantes, substituição pelo mesmo conjunto e por vazio; teste com instantes qualificados na volta do DST em Nova York |
| R24/R25/R26 | Não converter preferência ou limite da busca em erro obrigatório | remover preferências preserva o diagnóstico/cobertura; o comparador não otimiza; admissão, orçamento, preservação na falha e worker continuam em suítes próprias |

[tools/parity-differential.cjs](../tools/parity-differential.cjs) compila o probe Release do código atual com --no-incremental, falha se a compilação falhar e chama somente Application/Domain, sem HTTP, Infrastructure ou OR-Tools. AnalyzeSchedule e ValidateSchedule são comparados separadamente com analyzeDocument. O [digest comum](../shared/parity-contract.cjs), também usado por HTTP, compara multiconjuntos preservando duplicatas: código, gravidade, pessoa, início/fim e função dos diagnósticos; todos os campos de blocos/lacunas e score. Textos traduzidos e ordem de enumeração ficam fora do contrato; não se aplica tolerância numérica à pontuação. Um teste altera cada campo para verificar que o comparador detecta a mudança.

Propriedades adicionais: ambas as entradas permanecem imutáveis; serialização/migração é idempotente; ID, pessoa, função, início, fim, pausa, source e tags são preservados no round-trip/substituição. Ausência e null de pausa têm o mesmo significado, conforme o serializador existente; nenhuma janela é reparada. Na migração de timestamps qualificados, a conversão para civil e truncamento para segundos são intencionais e têm expectativas explícitas. Os conflitos de negócio dos documentos continuam carregáveis.

O [corpus](../shared/parity-corpus.cjs) usa xorshift32 com sementes 439041101, 1592594996 e 12648430, IDs/datas fixos e vocabulário finito de fronteiras; não usa relógio, crypto.randomUUID nem Math.random. Cada geração permite 1–32 entradas; o lote permite até 256, 8 milhões de caracteres e, por documento do probe, até 16 pessoas, 64 turnos e 32 exigências. Compilação tem prazo de 120s; execução C# 60s; buffers de saída 32MiB. São limites exclusivos do instrumento de teste. CI limita o job a oito minutos. Nenhum orçamento, grade ou limite do produto mudou. Esses cenários são amostragem direcionada, sem alegar prova exaustiva ou igualdade entre escalas ótimas alternativas.

### Reproduzir e investigar

Na raiz, com SDK .NET 10 e dependências do frontend instaladas pelo lockfile:

~~~powershell
node tools/parity-differential.cjs
node tools/parity-differential.cjs --seed 439041101
node tools/parity-differential.cjs --seed 439041101 --case seed-439041101-0
node tools/parity-differential.cjs --case explicit-empty-ids-revoke-stale-names
node tools/parity-differential.cjs --input artifacts/parity/failure.json
$oldTz=$env:TZ
try { $env:TZ='America/New_York'; node tools/parity-differential.cjs }
finally { $env:TZ=$oldTz }
~~~

Uma falha de comparação grava artifacts/parity/failure.json (ou --output DIRETORIO) com a entrada completa, ID/semente no caso, saídas C#/TS, asserção e runtime/fuso. Reexecutar --input usa o documento gravado, mesmo se o gerador mudar. Falhas de build, transporte ou prazo do probe terminam com erro explícito e logs do processo; não são classificadas automaticamente como divergência de negócio e podem não gerar failure.json. O runner não reduz automaticamente: preserve a falha original, remova pessoas/turnos/demandas sem perder o mesmo desacordo nem a validade estrutural e reduza tempos até a precisão de um segundo. Registre a entrada mínima e a decisão nesta página antes de alterar produção. Acrescente a regressão com expectativa independente; não atualize os 58 hashes para acomodar uma divergência.

A CI acrescenta parity-differential em UTC e America/New_York, dependência obrigatória do gate backend, com upload do documento de falha. O frontend continua executado nos dois fusos e HTTP compara os 12 novos documentos pelo worker real. A mesma configuração de CI ainda precisa executar no diff publicado; validação local Windows/Node 24 não substitui Ubuntu/Node 22. Resultados, comandos e pendências estão no [relatório desta entrega](decisions/011-deterministic-rule-parity.md).
