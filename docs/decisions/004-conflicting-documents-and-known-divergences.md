# ADR 004 — Documentos conflitantes e divergências herdadas

Data: 23/10/2026. Estado: preservação aceita; correção da divergência D1 implementada separadamente na etapa 5 (seguimento ao final); relatos das etapas anteriores preservados.

## Decisão

Validade estrutural é distinta de conformidade. Importação/API continuam verificando tipos, limites de segurança, referências e formato temporal pelos validadores atuais. Um turno aceito estruturalmente pode violar descanso, jornada, pausa ou ter sobreposição com outro: permanece recuperável, editável e diagnosticável. A futura construção de objetos internos não pode tornar irrecuperáveis esses arquivos por acrescentar regra de conformidade ao construtor.

Normalização e edição de cadastro não corrigem horários/pausas. Migrações são identificadas e idempotentes. Mudança explícita de função mantém seu efeito contratual nos turnos. Preferências influenciam objetivo, não validade. Falha de geração conserva escala anterior. Histórico anterior/posterior permanece integral, incluindo conflitos herdados.

## D1 — Multiplicidade do histórico na cobertura do solver (comprovada)

Reprodução: ArchitectureCharacterizationTests.SolverCountsOverlappingPreservedAssignmentsWhileAnalysisCountsPeople. Planejar segunda, 19/10/2026, demanda de equipe de 2 pessoas entre 00:00 e 02:00. Uma pessoa tem dois turnos preservados de domingo, 22:00–02:00 e 23:00–02:00; outra pode trabalhar segunda, 00:00–02:00.

O modelo fixa duas variáveis por atribuição em 1 e conta ambas para demanda. Escolhe não acrescentar a segunda pessoa, retornando as duas atribuições originais. BuildCoverage e frontend contam pessoas distintas: assigned=1, lacuna de 1 pessoa, score=0,5. Acrescentar explicitamente a pessoa disponível elimina as lacunas em Analyze. Para cobertura por função, o modelo também limita alocação por ID de atribuição, não por pessoa: esse ramo é risco por inspeção, não reprodução executada nesta etapa.

O contrato de [paridade](../rule-parity.md) continua determinando capacidade por pessoa sem duplicação por sobreposição. O teste fixa o resultado atual para expor a divergência; não o aprova como regra desejada. Não corrigir modelo nesta etapa. Correção separada deverá impedir contagem dupla, conservar turnos conflitantes/diagnósticos, atualizar este teste para o contrato pretendido e passar paridade C#/TS/HTTP. Não apagar histórico para tornar modelo coerente.

## Alcance distinto dos regimes (comprovado; impacto produtivo não demonstrado)

RegimeAloneDoesNotApplyCompanyRest comprova que HourBasedRegime.CanWork aceita descanso de 8h quando RestUnits=1, enquanto Diagnose rejeita pelo mínimo da empresa de 11h. NextEligibleStartIsOnlyALocalEstimateForDayRegime demonstra estimativa rejeitada pelo histórico futuro e avanço mínimo de um dia mesmo com RestUnits=0. São contratos parciais/nomes ambíguos; não afirmar defeito nas rotas atuais, que não usam essas estratégias. O ADR de portas impede promovê-las a avaliador canônico sem ajuste explícito.

## Pendências

D1 bloqueia afirmar equivalência global entre modelo/cobertura e concluir a futura etapa 5; não impede extração pura da etapa 2 que preserve implementação. Carregar evidências sem incorporar correção na refatoração. Casos não reproduzidos ficam como riscos na matriz, não novos defeitos confirmados.

## Seguimento na etapa 4 — 26/10/2026

O nome GetNextEligibleStart foi substituído por EstimateStartAfterRest; o cálculo e o alcance parcial de CanWork foram preservados e documentados no [ADR 006](006-scheduling-policies-and-regime-contracts.md). Políticas comuns substituem cálculos duplicados; não se passou a aplicar descanso da empresa dentro da estratégia em horas. Os 20 contratos novos também passam nos regimes anteriores isolados. A caracterização de D1 continua aprovada, com a divergência exposta e sem correção do modelo.

## Correção separada na etapa 5 — 26/10/2026

Depois de extrair componentes com os mesmos 365 testes aprovados, D1 foi corrigida em CoverageConstraints. A presença por pessoa/bloco é o OR de suas atribuições; equipe conta pessoas e as alocações direcionais compartilham uma capacidade por pessoa. O ramo de função, antes apenas risco, também foi reproduzido com o tradutor antigo em sonda isolada: ambos os escopos retornavam score 0,5/duas atribuições e agora retornam score 1/três atribuições. Nenhum histórico foi apagado ou ajustado.

A antiga caracterização foi atualizada para SolverCountsDistinctPeopleWithoutChangingOverlappingPreservedAssignments, mais regressões em OptimizationComponentsTests e fixtures C#/TS/HTTP. Os testes preservam os diagnósticos herdados. D1 deixa de bloquear a conclusão local da etapa 5 nos cenários comprovados; não se declara equivalência universal do modelo. Política de admissão, comparação e evidências: [ADR 007](007-optimization-translators-and-admission.md) e [relatório](stage-5-optimization-adapter.md).

Seguimento de consolidação: [ADR 008](008-final-boundaries-and-validation.md) e [revisão final](stage-6-final-review.md). Nomes/estados anteriores neste registro são históricos.
