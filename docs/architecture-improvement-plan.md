# Plano de evolução arquitetural

Data: 23/10/2026. Estado atualizado em 26/10/2026: etapas 1–5 validadas localmente; etapa 6 implementada e revalidada localmente; CI remota conferida para o código de d40f887, com aceite integral pendente de calibração de desempenho representativo. Pendência operacional da etapa 3 investigada e teste ajustado separadamente antes da extração da etapa 4. Etapa 3 introduz tipos, mapeadores e operações protegidas, preservando regras e formato. CI da implementação conferida na [revalidação atual](decisions/stage-6-current-validation.md); referências a CI pendente nas seções históricas registram o estado de cada entrega. Nenhuma integração foi feita nesta revalidação.

Seguimento em 26/10/2026: [fronteiras operacionais validadas](decisions/009-validated-operational-boundaries.md) reforça unidades/configuração na geração e a saída do agregado. Validação local atual: 612 testes .NET, 373 frontend em cada fuso e 16 HTTP. A CI verde de d40f887 é evidência do baseline; não cobre este diff local, cuja CI permanece pendente antes de integrar.

Seguimento em 27/10/2026: [extensibilidade dos regimes](decisions/010-regime-extension-boundaries.md) centraliza capacidades e metadados dos regimes, mantendo o contrato público fechado em dayBased/hourBased. Validação local: 623 testes .NET, 381 frontend em cada fuso e 16 HTTP. A CI [Validate #22](https://github.com/argemon/escalalivre/actions/runs/40377752675) de b8e88e3 foi conferida com sucesso; ela é o baseline e não cobre o novo diff local. CI do novo diff continua necessária antes de integrar.

## Objetivo e ponto de partida

Melhorar organização em camadas, DDD tático, modelagem de domínio, SOLID, consistência das regras e testabilidade, preservando comportamento público e documentos existentes. As notas da avaliação externa são sinais para investigação, não métricas reproduzidas nem defeitos comprovados.

Diagnóstico inicial do código (23/10/2026, anterior às extrações):

| Dimensão | Evidência | Direção verificável |
| --- | --- | --- |
| Camadas | Os projetos Domain, Application, Infrastructure e API já existem; Domain não possui referências de projeto/pacote. | Preservar a direção das dependências e verificar também acoplamento entre namespaces. |
| DDD tático | `ScheduleModels.cs` expõe records posicionais e coleções sem operações de agregado ou construção validada. | Proteger invariantes estruturais e mudanças explícitas sem perder documentos com conflitos diagnosticáveis. |
| Modelagem | `WorkloadRule` mistura regime em string, unidades inteiras e horas em double; IDs, códigos e janelas aparecem como primitivos. | Introduzir tipos onde reduzam estados ambíguos e erros de unidade; preservar o contrato externo com mapeadores. |
| SOLID | `IScheduleSolver` reúne Solve, Validate e Analyze; `OrToolsScheduleSolver` também calcula cobertura, sugestões e respostas; `ShiftRegimeFactory` instancia regimes concretos. | Separar capacidades e responsabilidades e mover composição de estratégias para a borda. |
| Consistência | `ScheduleRules`, regimes e restrições do solver representam aspectos das mesmas regras; já existem cenários compartilhados e testes de paridade. | Auditar sem presumir divergência; fixar uma semântica e verificar sua tradução para o solver. |
| Testabilidade | Análise e validação são métodos da implementação em Infrastructure que referencia OR-Tools. | Executar testes de domínio/análise sem o adaptador e manter testes específicos com OR-Tools real. |

Referências: [instruções](../AGENTS.md), [arquitetura atual e alvo](architecture.md), [paridade](rule-parity.md), [datas](date-time.md), [preservação](generation-preservation.md), [recuperação](recovery.md) e [fila](processing-queue.md).

## Contratos que devem ser preservados

- Endpoints, envelopes, diagnósticos (código, gravidade, pessoa, início, fim e função), blocos, lacunas e pontuação.
- Formato `.escalalivre`, versões suportadas, migrações identificadas/idempotentes e recuperação local.
- Tempo civil, segundos, períodos inclusivos conforme contrato, semana civil, viradas noturnas e histórico anterior/posterior.
- Restrições obrigatórias separadas de preferências, autorizações específicas e limites de busca do solver.
- Turnos fora do período e exceções autorizadas; falha ou cancelamento não substitui a escala existente.
- Proteções HTTP, limites de complexidade/memória/tempo, fila e isolamento do worker.

Refatoração não autoriza mudança de regra. Divergências confirmadas entram em correções separadas, com exemplo de entrada/saída e decisão explícita de contrato.

## Sequência de execução

Cada etapa é uma entrega revisável; só avance depois de cumprir sua saída. Os nomes de componentes abaixo são propostas, a ajustar ao vocabulário validado durante a implementação.

### 1. Caracterizar comportamento e registrar decisões

- Executar a suíte atual e registrar baseline de resultados e ambiente. Falhas anteriores devem ser identificadas antes das extrações.
- Inventariar regras em uma matriz: identificador, semântica, política C#, equivalente TS, diagnóstico, restrição do solver, preferência ou limitação operacional e testes de fronteira.
- Auditar especialmente descanso, ciclo móvel, limites diário/semanal, pausas, cobertura e histórico; confrontar `IShiftRegime`, `ScheduleRules` e o solver com `docs/rule-parity.md`.
- Acrescentar apenas cenários ausentes: igualdade nos limites, unidade, virada de dia/semana, histórico dos dois lados, autorizações e conflitos preservados.
- Registrar decisões sobre limites dos agregados, tipos temporais, responsabilidades das portas e tratamento de documentos conflitantes em `docs/decisions/`.

**Saída:** baseline e matriz rastreável; inconsistências comprovadas separadas de riscos. Dependência: nenhuma. Rollback: apenas novos testes/documentos.

#### Progresso verificado da etapa 1 — 23/10/2026

- [x] Baseline do checkout/ambiente registrado antes das adições; nenhuma falha de suíte anterior. Limitações iniciais de sandbox resolvidas com execução autorizada.
- [x] Matriz de 26 famílias de regras com políticas C#/TS, regimes, diagnósticos, restrições/preferências/limites e evidências de fronteira.
- [x] Nove cenários compartilhados acrescentados somente para lacunas identificadas (58 no total); nove casos C# diretos e um teste TS de cobertura por segundo.
- [x] Quatro decisões sobre limites de consistência, tipos temporais, portas e documentos conflitantes.
- [x] Verificações completas locais: frontend 349/349 (também America/New_York), backend 354/354, integração HTTP 15/15, lint e builds aprovados.
- [x] D1 comprovada: modelo conta atribuições preservadas sobrepostas na cobertura de equipe, análise conta pessoas; reprodução caracteriza comportamento anterior. Correção não incluída.

Relatório, logs, matriz e pendências: [baseline da etapa 1](decisions/stage-1-baseline-and-rule-map.md). Decisões: [agregados](decisions/001-planning-consistency-boundaries.md), [tempo](decisions/002-civil-time-and-units.md), [portas](decisions/003-analysis-optimization-ports.md), [conflitos/D1](decisions/004-conflicting-documents-and-known-divergences.md).

Situação em 23/10/2026: etapa 2 ainda não iniciada. A extração podia prosseguir preservando reprodução de D1; não declarar equivalência global modelo/avaliador nem concluir etapa 5 antes de correção separada. CI Linux/Node 22 e execução sem roll-forward são verificações de ambiente não executadas, sem falha determinística local pendente. Houve falha intermitente no teste existente de fila com timeout de 1s (504 em vez de 200), seguida de repetição isolada; investigar antes da integração, conforme o relatório.

### 2. Desacoplar análise e validação da otimização

- Extrair cálculo de cobertura, diagnósticos, contratação e sugestões de `OrToolsScheduleSolver` para serviços puros do domínio, com responsabilidades separadas.
- Criar casos de uso em Application para analisar, validar e gerar; manter análise/validação sobre a mesma avaliação canônica. Não duplicar o avaliador porque existem dois endpoints.
- Substituir progressivamente `IScheduleSolver` por portas de capacidade, por exemplo `IScheduleOptimizer` e `IScheduleAnalyzer`, usando um adaptador temporário para consumidores antigos.
- Separar montagem de `ScheduleResult` em Application e adaptar API, DI e protocolo do worker sem alterar o isolamento dos cálculos.

**Saída:** análise e validação testáveis com Domain/Application, sem referência ao pacote ou ao projeto de OR-Tools; paridade HTTP e contratos inalterados. Dependência: etapa 1. Rollback: fachada temporária preserva a implementação anterior até a troca de consumidores.

#### Progresso verificado da etapa 2 — 26/10/2026

- [x] Saída da etapa 1 conferida antes da extração; backend anterior revalidado em 354/354. D1/riscos continuam separados.
- [x] Diagnóstico canônico puro preservado em ScheduleRules; extraídos CoverageDemand, ScheduleCoverage, ScheduleSuggestions e ScheduleExplanation. HiringDemand já puro foi reutilizado; ScheduleEvaluator compõe a avaliação sem Infrastructure.
- [x] Application contém AnalyzeSchedule, ValidateSchedule e GenerateSchedule; os dois primeiros usam o mesmo IScheduleAnalyzer. IScheduleOptimizer retorna seleção/status, sem montar ScheduleResult.
- [x] Montagem de ScheduleResult em Application; worker resolve casos de uso por DI no mesmo processo filho/protocolo. Fila, cancelamento e limites mantidos. OrToolsScheduleSolver é fachada temporária, fora da composição produtiva.
- [x] Projeto isolado com apenas Application/Domain: 64 testes aprovados, incluindo 58 respostas completas comparadas com hashes capturados antes da extração e verificação de ausência de Infrastructure/API/OR-Tools no deployment.
- [x] Adaptador/fachada/composição: 356 testes aprovados. Frontend: 349, também America/New_York. HTTP/worker: 15; lint e builds aprovados.
- [x] Projeto isolado incluído na solução e na CI. CI remota/Linux não executada nesta sessão.

Relatório, contratos preservados, logs, rollback e pendências: [extração da etapa 2](decisions/stage-2-analysis-extraction.md). Situação ao concluir a etapa 2: saída local atendida; etapa 3 ainda não iniciada. D1 permanece reproduzida e a sensibilidade temporal do teste de fila continua pendente. Não foi antecipada a rejeição de violações novas nem a decomposição matemática da etapa 5.

### 3. Introduzir tipos de domínio e operações protegidas

- Criar gradualmente objetos de valor para janelas, pausas, período e configuração de regime. Distinguir duração, horas e contagem de dias; manter a precisão atual nos mapeamentos.
- Separar DTOs serializáveis de objetos de domínio. Preservar camelCase, campos opcionais, IDs e migrações; testar ida e volta de documentos legados e atuais.
- Definir um agregado de planejamento apenas para as operações que exigem consistência conjunta, como atribuir, substituir e remover turnos; explicitar o limite da configuração de pessoas/empresa. Avaliação entre agregados fica em políticas de domínio.
- Proteger identidade, referências necessárias à operação e coleções por cópias defensivas/coleções imutáveis. Proibir construções estruturalmente impossíveis sem bloquear turnos com conflitos de negócio.
- Encaminhar comandos explícitos pelas operações correspondentes. Configuração alterada recalcula diagnósticos; não ajusta horários existentes.

**Saída:** invariantes estruturais não podem ser burladas pelas APIs públicas dos novos tipos; conflito de negócio permanece carregável e diagnosticável; round-trip e preservação passam. Dependência: etapa 2. Rollback: migração interna por mapeadores, sem mudança de schema nesta etapa.

#### Progresso verificado da etapa 3 — 26/10/2026

- [x] Saída da etapa 2 conferida e revalidada antes das mudanças: 64 testes isolados e 356 de adaptador aprovados.
- [x] Valores civis para janelas, pausas e período, com duração/dias/horas explícitos; variantes tipadas de configuração de regime e construção validada.
- [x] PlanningSchedule protege identidade, proprietários, coleções e operações de atribuição, atualização, exclusão, movimento e substituição atômica por período. PlanningSettings separa o snapshot de configuração.
- [x] DTOs de arquivo/API em Application, mapeadores de projeções e tipos internos, sem mudança de schema, opcionais ou migrações. Records legados permanecem projeções de leitura para transição progressiva dos consumidores.
- [x] GenerateSchedule aplica seleções pelo agregado. PlanningEditor coordena mudanças explícitas, preserva horários, atualiza a função na edição da pessoa e recalcula análise, sem novos endpoints.
- [x] Coleções imutáveis e testes contra mutação por fontes externas, IList e sincronização pública; operações inválidas não confirmam alterações parciais.
- [x] 157 testes isolados e 364 de adaptador/contratos aprovados; frontend 349, também America/New_York; lint e builds aprovados. Os 58 hashes anteriores continuam os mesmos.
- [x] Validação operacional local encerrada no início da etapa 4: suite original 15/15, com intermitência focal reproduzida; sonda de recuperação da análise ajustada separadamente, mantendo timeout/worker, e gate 15/15 antes da extração. Resultados 14/15 e comparação da etapa 2 preservados no relatório. CI remota continua pendente.
- [x] Documentos com descanso/jornada/pausa em conflito permanecem carregáveis, editáveis e diagnosticáveis. Round-trip atual/legado e migração temporal idempotente verificados.

Decisão: [ADR 005](decisions/005-validated-planning-and-transport.md). Evidências, logs, limites da transição e pendências: [relatório da etapa 3](decisions/stage-3-protected-planning.md). Construção e round-trip atendidos; a pendência operacional local foi investigada e encerrada antes da extração da etapa 4 pelo ajuste de teste descrito no relatório seguinte. CI remota pendente antes da integração. D1 segue pendente para correção separada. Não foram antecipadas unificação de regimes, decomposição do modelo ou rejeição de novas violações de negócio da etapa 5.

### 4. Unificar semântica e extensibilidade de regimes

- Extrair políticas coesas de jornada efetiva, descanso, ciclo, intervalo, disponibilidade e elegibilidade, aproveitando helpers puros existentes.
- Fazer estratégias de regime e diagnóstico consumirem essas políticas. Revisar o significado de `GetNextEligibleStart`: sem histórico completo, não deve prometer elegibilidade global; renomear ou ajustar o contrato conforme a decisão registrada.
- Receber estratégias no resolvedor; registrar implementações na composição. Falhar explicitamente para regime desconhecido e registro duplicado, preservando o tratamento externo documentado.
- Documentar pré/pós-condições de cada capacidade e criar testes de contrato aplicáveis a todos os regimes. Compartilhar a infraestrutura de testes sem impor regras idênticas a regimes diferentes.
- Atualizar TypeScript e cenários compartilhados quando a organização das políticas mudar; nenhuma lógica de negócio nova deve nascer nos componentes React.

**Saída:** tabela de paridade completa e testes de contrato; nova estratégia pode ser registrada sem modificar o resolvedor nem consumidores genéricos. Dependências: etapas 1 e 3. Rollback: manter resolução antiga por fachada até equivalência comprovada.

#### Progresso verificado da etapa 4 — 26/10/2026

- [x] Saída da etapa 3 revalidada: 157 testes puros, 364 backend; investigação de deadline, ajuste de teste separado e HTTP 15/15 antes de aplicar políticas. Nenhum timeout de produção ampliado.
- [x] EffectiveWorkPolicy, RestPolicy, DayCyclePolicy, IntervalPolicy, AvailabilityPolicy e ShiftEligibilityPolicy consumidas por diagnóstico/regimes; helpers anteriores delegam. Adaptador reaproveita políticas sem decomposição do modelo.
- [x] Estratégias injetadas no resolvedor, registros na composição; testes de terceira estratégia, tipo desconhecido e duplicações. Contrato externo continua rejeitando regimes desconhecidos com 400.
- [x] EstimateStartAfterRest substitui GetNextEligibleStart; mesma aritmética, contrato parcial explícito, histórico bilateral exigido para decidir sobre candidatos.
- [x] Vinte novos contratos compartilhados C#/TS, conferidos também nas implementações originais; matriz de 26 famílias atualizada. Nenhum documento/hashes anteriores alterados.
- [x] 184 testes puros, 365 backend, 369 frontend também em NY, lint/builds e HTTP 15/15 aprovados localmente.
- [x] Nenhuma correção de negócio misturada; D1 continua caracterizada, para correção separada antes de concluir a etapa 5.
- [ ] CI remota/Linux/Node 22 e SDK exato sem roll-forward, antes de integrar.

Decisão: [ADR 006](decisions/006-scheduling-policies-and-regime-contracts.md). Evidências, ajuste operacional, alcance da extensão e pendências: [relatório da etapa 4](decisions/stage-4-domain-policies.md). Saída local atendida; etapas 5–6 ainda não iniciadas. Não declarar equivalência global modelo/avaliador devido a D1.

### 5. Decompor o adaptador OR-Tools

- Separar geração de candidatos, orçamento de complexidade, tradução de restrições, objetivo, execução e leitura do resultado.
- Manter `CpModel`, `BoolVar`, `LinearExpr` e `CpSolver` exclusivamente em Infrastructure. Políticas de domínio fornecem limites e decisões em tipos próprios.
- Organizar tradutores por família: exclusividade diária, descanso, carga semanal, ciclo e cobertura/alocação. Tradutores implementam as mesmas regras, mas não compartilham objetos OR-Tools com o domínio.
- Preservar pesos/prioridades, granularidade da busca, limites de candidatos/passos, status e turnos fixos. Uma mudança de otimização ou desempenho exige entrega e medição próprias.
- Reavaliar o resultado final pelo avaliador canônico; distinguir conflitos herdados de violações introduzidas. Resultado novo que viole restrição obrigatória aplicável não é aplicado: devolver falha diagnosticável preservando o documento, segundo o contrato definido na etapa 1.

**Saída:** testes das traduções com modelos pequenos e OR-Tools real; escalas novas satisfazem restrições; timeout, inviabilidade, excesso de complexidade e cancelamento preservam dados. Dependências: etapas 2 e 4. Rollback: conservar a fachada até validar substituição completa.

#### Progresso verificado da etapa 5 — 26/10/2026

- [x] Saída local da etapa 4 revalidada: 184 testes puros, 365 backend e 15 HTTP, sem falhas no baseline. CI remota segue necessária antes de integrar.
- [x] Extração de candidatos, orçamento, entrada/contexto/construção, seis famílias registradas de tradução, objetivo, execução e leitura. Extração sem correção de regra aprovada nos mesmos 365 testes.
- [x] Tipos de OR-Tools exclusivamente em Infrastructure na produção; domínio fornece semântica/saldos em ticks/datas por políticas puras. API compõe famílias; contexto/orçamento por cálculo.
- [x] Pesos, prioridades, grades, limites de candidatos/passos, 5s/um worker, status e protocolo/isolamento preservados.
- [x] D1 corrigida separadamente após a extração, com reprodução antigo/corrigido em equipe e função; histórico e conflitos preservados, novos casos C#/TS/HTTP.
- [x] GenerateSchedule reavalia e protege estrutura/histórico; GenerationConformance distingue conflitos herdados e participação nova em erros agregados. Novas violações retornam invalid/solverInvalid e documento anterior.
- [x] Modelos pequenos com OR-Tools real: viabilidade, inviabilidade, Unknown por timeout, ModelInvalid, descanso, semana, ciclo, cobertura e limites. Cancelamento/recuperação com worker real e preservação no cliente mantidos.
- [x] 197 puros, 384 backend, 371 frontend também em NY, lint/builds e 16 HTTP aprovados. Os 58 documentos/hashes e 20 contratos de regimes anteriores continuam iguais.
- [ ] CI remota/Linux/Node 22/SDK exato, antes de integrar; medições e remoção de fachadas pertencem à etapa 6.

Decisão: [ADR 007](decisions/007-optimization-translators-and-admission.md). Logs, sequência das mudanças, limites e pendências: [relatório da etapa 5](decisions/stage-5-optimization-adapter.md). Saída local atendida; etapa 6 ainda não iniciada. D1 não é mais um bloqueio nos casos comprovados, sem alegação de equivalência universal.

### 6. Consolidar fronteiras e manutenção

- Adicionar testes de arquitetura para dependências proibidas e vazamento de tipos externos; separar testes puros, testes do adaptador e integração HTTP.
- Concluir os consumidores das portas menores, remover fachadas e lógica duplicada só após provar equivalência e revisar usos.
- Medir nos mesmos cenários o tempo, memória e tamanho do modelo antes/depois, registrando ambiente. Definir limites de regressão com base no baseline; não adotar percentuais arbitrários.
- Atualizar documentação e CI, executar a validação completa e revisar o diff de contratos.

**Saída:** CI verde, dependências protegidas, documentação compatível com o código e relatório de preservação/comportamento e medições. Dependência: etapa 5. Rollback: reverter a entrega isolada; evitar migrações destrutivas.

#### Progresso verificado da etapa 6 — 26/10/2026

- [x] Aceite das cinco etapas anteriores revisto; baseline 197 puros/384 mistos/16 HTTP aprovado. Os 58 documentos/hashes e os contratos compartilhados permanecem iguais.
- [x] Todos os consumidores ativos da fachada migrados; 207 puros + 366 adaptador + 8 API reproduziram os 581 casos anteriores antes de retirar IScheduleSolver/OrToolsScheduleSolver/LegacySolverComposition.
- [x] Removidas delegações/aliases temporários com consumidores usando políticas; modelos/tipos nativos encapsulados em Infrastructure, sem vazamento público.
- [x] Projetos e CI separados: puro, adaptador, API, arquitetura e HTTP. Treze testes C# de arquitetura, com negativos para o scanner, e dois frontend adicionados.
- [x] Validação completa local: 207 puros, 366 adaptador, 8 API, 13 arquitetura, 373 frontend também em NY, lint/builds e 16 HTTP. Fila, worker, recuperação, contratos e formatos preservados.
- [x] Comparação retrospectiva no mesmo ambiente e entradas, com tempo/alocação/pico/modelo, dados brutos e limites observados de alerta. Resultados mistos, sem ganho global afirmado.
- [x] Documentação atual e matriz de evidências das seis dimensões revisadas; relatos/logs antigos preservados como históricos.
- [x] CI remota Ubuntu/Node 22 conferida: Validate #20 associada ao commit d40f887, seis jobs verdes; merge de teste 0f32fa5 sem diferença de arquivos para o commit local. [Revalidação completa dos fontes e evidências](decisions/stage-6-current-validation.md).
- [ ] Calibração de limites de regressão em carga representativa/ambiente alvo. As amostras pequenas fornecem alertas, não gates universais.

Decisão: [ADR 008](decisions/008-final-boundaries-and-validation.md). Evidência por etapa/dimensão, falhas e limitações: [revisão final](decisions/stage-6-final-review.md). Medição: [desempenho](decisions/stage-6-performance.md). O plano não é marcado integralmente concluído enquanto a calibração representativa acima estiver aberta; nenhuma integração foi feita.

## Matriz de validação

| Área | Evidência exigida |
| --- | --- |
| Domínio e agregados | Construção inválida, operações explícitas, coleções protegidas, limites temporais e conflitos diagnosticáveis. |
| SOLID | Testes das portas e regimes; análise sem OR-Tools; registro extensível; testes de arquitetura. |
| Regras | Cenários compartilhados e paridade dos diagnósticos, cobertura, lacunas e pontuação em TS, C# e HTTP. |
| Otimização | Modelos pequenos viáveis/inviáveis; revalidação da saída; preservar status, prioridade e dados anteriores. Não exigir a mesma escala quando houver múltiplas soluções equivalentes. |
| Contratos e recuperação | Formato nativo/JSON, migrações idempotentes, documentos legados, import/export e preservação de horários. |
| Operação | Fila, worker, cancelamento, limites HTTP, memória/tempo/complexidade e falhas. |

Comandos existentes, na raiz, a executar nas etapas de código conforme impacto e integralmente antes da integração:

```powershell
node --test frontend/tests/*.test.cjs
dotnet test backend/EscalaLivre.Analysis.Tests/EscalaLivre.Analysis.Tests.csproj -c Release
dotnet test backend/EscalaLivre.Adapter.Tests/EscalaLivre.Adapter.Tests.csproj -c Release
dotnet test backend/EscalaLivre.Api.Tests/EscalaLivre.Api.Tests.csproj -c Release
dotnet test backend/EscalaLivre.Architecture.Tests/EscalaLivre.Architecture.Tests.csproj -c Release
npm --prefix frontend run lint
npm --prefix frontend run build
dotnet build backend/EscalaLivre.Api/EscalaLivre.Api.csproj -c Release
$env:SECURITY_BUILD_CONFIGURATION = 'Release'
node backend/security.integration.cjs
```

Executar também os testes de regras em `America/New_York`, preservando/restaurando `TZ`, para detectar dependência do fuso do dispositivo. Usar o SDK definido em `global.json` e as dependências do lockfile.

## Critério de conclusão e primeira entrega de código

O plano termina quando as seis dimensões têm as evidências acima, todos os contratos preservados passam e as fachadas temporárias foram removidas. Não há promessa de nova nota numérica: o resultado deve ser demonstrável pelo código e pelos testes.

Os resultados e as pendências das etapas 1–6 estão registrados acima; as próximas seguem suas dependências e critérios de saída. Novos recursos, reescrita completa, banco de dados, CQRS/event sourcing e mudanças de regras não fazem parte deste plano.

## Seguimento de desempenho — 27/10/2026

- [x] Baseline atual em oito cargas sintéticas, com cinco processos aquecidos por caso/operação, tempo/alocação/memória/modelo, fases separadas e HTTP/fila/worker antes/depois. [Relatório e evidências](decisions/012-current-performance.md).
- [x] Gargalo comprovado de cobertura/histórico otimizado por índice local, preservando respostas e modelos; controles alternados e validação funcional registrados no relatório.
- [x] Envelopes locais de regressão derivados dos dados e MAD/faixas; workflow manual de coleta/alertas sem gate numérico portátil.
- [ ] Repetir e calibrar no ambiente alvo/Linux com mais sessões independentes; cinco amostras locais não fixam p95/p99 ou SLO.
- [ ] CI própria do diff de regimes/paridade/desempenho antes de integrar. O aceite integral da etapa 6/plano permanece aberto; a CI histórica do baseline não atende esse critério.
