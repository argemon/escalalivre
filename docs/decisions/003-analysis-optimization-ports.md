# ADR 003 — Capacidades de análise e otimização

Data: 23/10/2026. Estado: decisão implementada na etapa 2 em 26/10/2026; fachada temporária preservada.

## Evidência anterior à extração (23/10/2026)

IScheduleSolver (histórico; removido na etapa 6) reúne Solve, Analyze e Validate. OrToolsScheduleSolver (histórico; removido na etapa 6) faz modelo, cobertura, sugestões, diagnóstico e resposta. Analyze/Validate chamam exatamente BuildResult; DetectConflicts delega ScheduleRules.Diagnose. IShiftRegime e sua fábrica não são consumidos pelo solver atual (busca de referências em todos os arquivos C# de produção).

## Decisão

Application declarará portas pequenas por capacidade. Otimizar não é requisito para analisar/validar. Um único avaliador puro fornecerá diagnósticos e cálculos canônicos para ambos os casos de uso; não criar dois avaliadores por causa de endpoints distintos. Cobertura, contratação e sugestões serão separadas por responsabilidade em Domain; montagem de resultado e mapeamento ficarão em Application. Adaptador e tipos OR-Tools permanecem em Infrastructure; composição, fila e worker continuam na borda API.

Pré-condições: entrada estruturalmente aceita, período compatível, histórico completo disponível. Pós-condições de análise/validação: não mutar entrada, não remover conflito, mesmos diagnósticos/blocos/lacunas/score, otimização not-run. O avaliador deve ser testável sem OR-Tools.

Otimização: preservar histórico externo e autorizações; distinguir prova optimal/feasible de cobertura completa. Inviabilidade, timeout, complexidade e cancelamento preservam o documento anterior conforme os contratos HTTP/worker atuais. A fachada temporária mantém códigos e envelopes. Cancelamento continua pertencendo à execução do worker; esta decisão não afirma que a interface síncrona atual aceita CancellationToken.

Antes de aplicar novos resultados, a evolução da etapa 5 distinguirá conflitos herdados de violações introduzidas e recusará novas violações obrigatórias. No ponto de partida, BuildResult apenas relatava conflitos. A etapa 2 mantém essa semântica no avaliador extraído: a rejeição de novas violações obrigatórias ainda não está implementada. Uma lacuna isolada admite escala parcial e não equivale a uma violação obrigatória.

## Regimes e aceite

CanWork atual responde apenas à parcela de regra do regime e recebe histórico já filtrado para a pessoa; não substitui avaliação global. GetNextEligibleStart recebe apenas um fim/configuração: é estimativa local, sem garantia global. Etapa 4 ajustará nome/contrato e testará as implementações sem exigir regras idênticas. Não conectar a fábrica ao solver durante a extração, pois isso introduziria nova rota de decisão sem equivalência demonstrada.

Aceite: análise sem Infrastructure/OR-Tools, paridade HTTP, cenários compartilhados e worker isolado com falha/cancelamento preservados. Não criar interface para toda função pura.

## Implementação e transição — 26/10/2026

IScheduleAnalyzer expõe Analyze; AnalyzeSchedule e ValidateSchedule delegam à mesma instância/capacidade. IScheduleOptimizer devolve ScheduleOptimizationResult (atribuições completas/selecionadas, status e problemas), separado do envelope ScheduleResult montado em Application. ScheduleEvaluator e os cálculos puros estão em Domain; ScheduleAnalyzer adapta a avaliação.

OrToolsScheduleOptimizer implementa seleção e mantém o modelo anterior. GenerateSchedule usa ambas as portas; OrToolsScheduleSolver/IScheduleSolver são apenas compatibilidade e não são registrados no worker produtivo. A composição de leitura não registra otimizador; a de solve o acrescenta no processo filho. Os testes isolados (64), do adaptador/composição (356) e HTTP (15) passaram. [Detalhes, logs e pendências](stage-2-analysis-extraction.md). Remoção da fachada fica para a consolidação após migrar os consumidores de teste.

## Admissão implementada na etapa 5 — 26/10/2026

O estado anterior descrito acima foi sucedido pela reavaliação/admissão em GenerateSchedule. Falhas sempre usam as atribuições originais, mesmo diante de uma proposta incoerente da porta. Resultados viáveis só são admitidos após agregado e avaliação canônica; novas violações ou agravamento retornam invalid/solverInvalid, mantendo o envelope e a interface do store. Critérios de herança e tratamento de erros: [ADR 007](007-optimization-translators-and-admission.md). A fachada continua temporária para a etapa 6.

Seguimento de consolidação: [ADR 008](008-final-boundaries-and-validation.md) e [revisão final](stage-6-final-review.md). Nomes/estados anteriores neste registro são históricos.
