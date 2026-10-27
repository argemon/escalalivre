# ADR 010 — Extensibilidade dos regimes e fronteiras de contrato

Data: 27/10/2026. Estado: implementado e validado localmente; CI do novo diff pendente antes de integrar. Base: b8e88e32893336f2626bd0c557ef751c8fcd3b4d. Segue [AGENTS](../../AGENTS.md), [arquitetura](../architecture.md), [plano](../architecture-improvement-plan.md), [paridade](../rule-parity.md) e ADRs [005](005-validated-planning-and-transport.md), [006](006-scheduling-policies-and-regime-contracts.md), [009](009-validated-operational-boundaries.md).

## Diagnóstico da extensão antes desta entrega

ShiftRegimeFactory já resolvia uma estratégia registrada sem conhecer seu tipo concreto e rejeitava duplicações. Porém a execução principal de análise/geração não passava por essa fábrica: RegimeConfiguration.From, DocumentSafety, EffectiveWorkPolicy, RestPolicy, ScheduleRules, GenerationConformance e DayCycleConstraints conheciam nomes ou variantes específicas. No TS, schema, políticas e dois formulários repetiam conhecimento semelhante. Logo o teste anterior de terceira estratégia demonstrava a extensão do resolvedor, sem demonstrar um terceiro regime de produto.

Os [99 casos de contratos/hashes do baseline](evidence/regime-extension/baseline-contracts.trx) foram reexecutados antes da edição. A [CI #22](https://github.com/argemon/escalalivre/actions/runs/40377752675) de b8e88e3 foi conferida como completed/success ([consulta](evidence/regime-extension/baseline-ci.json)); não é evidência remota do diff novo.

## Mapa completo: contrato legítimo e repetição evitável

| Fronteira / arquivos | Mudança legítima ao acrescentar um regime de produto | Repetição eliminada nesta entrega |
| --- | --- | --- |
| Domain.Planning.RegimeConfiguration e classe concreta | Definir unidades/invariantes e mapeamento; incluir uma entrada explícita no mapa canônico de produto | Identificadores em constantes das configurações; From e IsSupported compartilham o mapa; não há lista paralela em DocumentSafety |
| Application.Contracts.Documents/ScheduleDocumentMapper/ScheduleJson | Se houver campos/unidades/formato novos: atualizar DTOs, mapeamento de ida/volta, conversão e decisão de compatibilidade/migração | Regimes com o formato atual continuam cópias primitivas dos mesmos campos, sem novo switch no DTO/JSON |
| DocumentSafety/ScheduleRequestValidator/shared/document-validation-limits.json | Definir limites estruturais para campos novos ou domínios de valores distintos; revisar paridade de aceitação | Nome aceito vem de IsSupported; continuam os limites compartilhados atuais de trabalho, repouso, semana e duração |
| Domain.Regimes e API.ServiceCollectionExtensions | Implementar a capacidade parcial/estimativa e registrá-la na composição de análise/worker | Resolvedor permanece genérico; RegimeEligibility compõe as famílias declaradas, sem mais ramificações por nome |
| ScheduleRules/EffectiveWorkPolicy/RestPolicy/DayCyclePolicy | Regras de uma família nova exigem política/diagnóstico próprios; textos, gravidade e contexto fazem parte do contrato | Limite de trabalho, descanso e presença de ciclo são consultados na configuração; não se repete dayBased/hourBased |
| GenerationConformance | Família nova precisa de contrato explícito de participação/agravamento de erros herdados | A família móvel de datas é reconhecida por RollingCycle, sem comparação de nome |
| ScheduleCandidateGenerator/PlanningSettings | Se duração/entradas/pausas do novo regime não couberem na grade atual, requer mudança específica de candidatos e testes de orçamento | Herança continua em RegimeFor; filtro de trabalho consulta MaximumShiftWork genericamente |
| Infrastructure.Solver.Constraints e composição da otimização | Regra matemática nova exige tradutor e registro de família; novas preferências podem exigir objetivo próprio | Descanso e semana já eram genéricos; DayCycleConstraints usa RollingCycle e DayCycleLimit, sem testar a classe principal do regime |
| frontend/types/schedule.ts e lib/regimes.ts | Acrescentar tipo ao contrato TS e definir metadados/capacidades equivalentes | schema deriva de regimeTypes; rótulos/opções/descrições e interpretação de unidades ficam em uma definição por regime |
| Frontend schema/políticas/formulários | Campos ou forma de edição novos exigem schema/editor próprios; regras novas exigem política TS correspondente | Rest, work, dayCycle, diagnóstico e formulários consultam definições/capacidades, sem condicionais por nome |
| shared + testes C#/TS/HTTP | Acrescentar cenários de fronteira, configuração, histórico, admissão, tradução e compatibilidade | Cenários anteriores e hashes permanecem como regressões; não se reescrevem para acomodar a extensão |

Os arquivos citados na tabela são caminhos relativos a backend/EscalaLivre.Domain, Application, Infrastructure, Api ou frontend/src conforme o prefixo. API compõe serviços; não decide regras nem substitui o isolamento do worker.

## Solução proporcional

RegimeConfiguration permanece a configuração validada. Cada variante fornece três capacidades explícitas das famílias existentes: MaximumShiftWork (Duration opcional), RestBetweenShifts (Duration opcional) e RollingCycle (DayCycleLimit opcional). DayCycleConfiguration fornece ciclo; HourCycleConfiguration fornece limite de trabalho e descanso. Propriedades abstratas exigem uma decisão explícita da implementação. Não há carregamento dinâmico, descoberta por reflexão, DSL, visitor, catálogo editável ou novo framework de plugins.

DayCycleLimit contém trabalho positivo em dias, repouso não negativo e ciclo total representável; DayCycleConfiguration delega a ele as invariantes anteriores. O limite não retém a configuração que o originou e pode compor outra configuração sem ciclos no grafo. Na revisão foi substituída a primeira representação, que devolvia a própria configuração como capacidade, antes da conclusão. Os [resultados intermediários](evidence/regime-extension/before-cycle-value/results.json) são históricos; a matriz final recompilou o valor independente e acrescentou teste de construção/representação sem recursão.

O mapa de produto é privado e canônico, com comparação ordinal exata: dayBased/hourBased continuam sendo os únicos tipos aceitos. As funções de mapeamento ficam nas configurações concretas; adicionar uma entrada ao mapa é uma decisão de contrato. ShiftRegimeFactory continua separada: resolve estratégias sem diferenciar caixa, rejeita tipo vazio/desconhecido e duplicação também por diferença de caixa. Sua lista injetada não amplia o schema ou o mapa de produto.

RegimeEligibility aplica somente as famílias que a configuração fornece e é usado pelas estratégias embutidas. Ausência de descanso não equivale a zero: dias não verifica sobreposição nessa capacidade parcial; horas com repouso zero ainda verifica overlap. O diagnóstico global continua impondo descanso da empresa e exclusividade diária. A estimativa local continua específica: dias avança max(1, repouso em dias), horas soma repouso em horas; ela não prova elegibilidade com histórico.

O cliente mantém implementação distinta: regimeTypes fecha o contrato e lib/regimes reúne restrições, unidades, opções, rótulos e descrições. documentSchema usa a mesma lista. As políticas de trabalho/descanso/ciclo e o diagnóstico leem capacidades; CompanyEditor/EmployeeDrawer e rótulos de planejamento leem metadados. Não foi acrescentado cálculo de negócio em React. Primitivos no JSON/DTO/projeções continuam adequados e não ganharam wrappers por uniformidade.

## O que a estratégia adicional prova — e o que ainda exige trabalho

RegimeExtensionTests declara CombinedStrategy e CombinedConfiguration apenas no projeto puro. Ela combina teto de trabalho, descanso e limite móvel de datas, registra-se em ShiftRegimeFactory e reutiliza RegimeEligibility, RestPolicy e políticas de capacidade sem editar esses componentes. Os casos distinguem sucesso, trabalho excedido por um segundo, descanso insuficiente, ciclo com histórico no dia vizinho, ordem/duplicação do histórico, estimativa e registro duplicado. Um teste específico mantém a diferença entre repouso ausente e zero.

A configuração de teste NÃO está no mapa C#, na composição produtiva, na lista TS nem no schema. Testes exigem sua rejeição como configuração de empresa/pessoa; HTTP testa testCombined, unregistered, caixa incorreta e espaço adicional em analyze/validate/solve, todos com 400. A suíte frontend também rejeita nomes herdados do protótipo de objeto. Nenhum novo regime é exibido ou serializado pelo produto.

A prova adicional cobre resolução, elegibilidade parcial e composição das famílias puras. Não é uma execução ponta a ponta de um terceiro regime pelo solver: mapeamento/validação de produto continuam deliberadamente fechados. Os tradutores e a geração reais são verificados pelos regimes atuais, pelos modelos pequenos existentes e pelos cenários de paridade HTTP. Expor um terceiro regime ainda exige as etapas da próxima seção.

## Checklist exato para uma extensão futura

1. Fixar contrato e cenários: unidades, campos, limites, histórico bilateral, restrições obrigatórias/preferências e diagnósticos. Uma configuração válida não pode proibir o carregamento de turnos apenas conflitantes.
2. Criar a configuração validada e seu mapeamento explícito; acrescentar o identificador ao mapa de produto em RegimeConfiguration. Declarar todas as capacidades existentes que se aplicam. Se o formato for o mesmo, os DTOs/copias de campos não precisam mudar; se não for, editar DTOs/mapeadores/conversores e decidir migração/versionamento, preservando leitura dos arquivos existentes.
3. Revisar DocumentSafety e limites compartilhados: o reconhecimento do nome acompanha o mapa, mas faixas e novos campos não surgem por registro. Não ampliar limites operacionais só para aprovar a extensão.
4. Implementar IShiftRegime e sua estimativa conforme o contrato parcial e registrar em AddScheduleAnalysis, inclusive a composição usada no worker. A fábrica não precisa mudar. Registrar sem mapear a configuração não habilita a execução principal.
5. Se a semântica cabe em trabalho máximo/repouso/ciclo móvel, configurar as capacidades e reutilizar políticas/consumidores existentes. Se for uma nova família, implementar política canônica, diagnóstico e contrato de participação de GenerationConformance; não mascarar agravamento de um conflito herdado.
6. Verificar se a grade/pausas/duração de ScheduleCandidateGenerator bastam. Regras novas que exijam outros candidatos ou outra tradução precisam de implementação específica, tradutor registrado em AddScheduleOptimization e, quando aplicável, objetivo próprio. RegimeEligibility não é a interface de tradução CP-SAT nem substitui a avaliação canônica da proposta.
7. Acrescentar o tipo em frontend/types/schedule.regimeTypes e a definição em lib/regimes, incluindo capacidades, nomes e descrições. Com os campos atuais não é necessário editar os select/labels dos dois formulários nem as políticas genéricas. Campos/famílias novos exigem schema, edição e política TS próprias; não há geração automática a partir de C#.
8. Acrescentar contratos compartilhados e testes de configurações inválidas/duplicadas, precisão de segundos, limites, herança, histórico dos dois lados, preservação de dados e admissão. Testar a tradução com OR-Tools real, sem exigir o mesmo ótimo entre soluções equivalentes.
9. Executar a matriz completa, incluindo frontend em America/New_York, arquitetura, arquivos antigos/atuais e HTTP/worker com fila, cancelamento e limites. Conferir CI para o novo código antes de integrar. Documentar exatamente quais componentes mudaram e quais foram reutilizados.

Não se promete extensão apenas por registro. O caso simples pode reutilizar as famílias e os campos atuais; uma semântica nova exige mudanças legítimas nos contratos e algoritmos que a representam.

## Preservação e validação

Mantidos JSON/schema 1.0.0, DTOs, formatos/migrações, segundos civis, herança, semana domingo–sábado, pausas sem cobertura, histórico bilateral, conflitos carregáveis e aplicação por agregado. Códigos/textos/ordem do diagnóstico, pesos/grades/orçamentos, prazo CP-SAT e limites HTTP não foram alterados. Os 58 hashes de análise, 20 contratos de regime e casos D1 anteriores permanecem iguais. Nenhum fixture/hash/lockfile/global.json foi modificado.

Ambiente: Windows 10.0.26100/win-x64, SDK 10.0.402/runtime 10.0.13, Node 24.17.0/npm 11.13.0; global.json permite latestFeature a partir de 10.0.201. TZ originalmente ausente, fuso America/Cuiaba; Nova York foi definido somente no filho. Sem SDK exato 10.0.201 sem roll-forward ou npm ci local. [Ambiente atual](evidence/regime-extension/environment.txt).

Primeiro baseline: dotnet test Analysis.Tests -c Release com filtro FullyQualifiedName~Regime|FullyQualifiedName~AnalysisContractTests: 99/99. Depois da centralização inicial, [225 testes puros](evidence/regime-extension/regime-analysis.trx) e 30 frontend focais passaram. A matriz final abaixo foi executada sem filtro, com rebuild integral dos fontes antes dos testes e novo build Release da API antes do HTTP; nenhuma validação de binários antigos. HTTP não teve build/testes concorrentes.

| Verificação | Resultado | Log |
| --- | --- | --- |
| solution-build | exit 0 | [solution-build](evidence/regime-extension/final/solution-build.txt) |
| analysis | 226/226 | [analysis](evidence/regime-extension/final/analysis.txt) |
| adapter | 376/376 | [adapter](evidence/regime-extension/final/adapter.txt) |
| api | 8/8 | [api](evidence/regime-extension/final/api.txt) |
| architecture | 13/13 | [architecture](evidence/regime-extension/final/architecture.txt) |
| frontend | 381/381 | [frontend](evidence/regime-extension/final/frontend.txt) |
| frontend-new-york | 381/381 | [frontend-new-york](evidence/regime-extension/final/frontend-new-york.txt) |
| lint | exit 0 | [lint](evidence/regime-extension/final/lint.txt) |
| frontend-build | exit 0 | [frontend-build](evidence/regime-extension/final/frontend-build.txt) |
| api-build | exit 0 | [api-build](evidence/regime-extension/final/api-build.txt) |
| http-worker | 16/16 | [http-worker](evidence/regime-extension/final/http-worker.txt) |

Comandos/argumentos/horários/exit codes completos: [results.json](evidence/regime-extension/final/results.json). O rebuild foi dotnet build EscalaLivre.slnx -c Release -t:Rebuild; quatro dotnet test por projeto (Analysis/Adapter/Api/Architecture) -c Release; node --test frontend/tests/*.test.cjs em ambos os fusos; npm --prefix frontend run lint e run build; dotnet build backend/EscalaLivre.Api/EscalaLivre.Api.csproj -c Release; node backend/security.integration.cjs com SECURITY_BUILD_CONFIGURATION=Release. [Manifesto SHA-256 dos fontes/configurações finais](evidence/regime-extension/final/source-manifest.json).

Total: 623 .NET (226 puros, 376 adaptador, 8 API, 13 arquitetura), 381 frontend em cada fuso, 16 HTTP; lint e builds aprovados. Sem falha/ignorado/cancelado na matriz final, sem intermitência reproduzida. A arquitetura frontend passa a inspecionar também lib/regimes, mantendo as verificações das seis políticas e os negativos do scanner. Nenhum teste ou limite foi enfraquecido.

## Pendências

CI #22 verde valida apenas b8e88e3, o baseline. Este novo diff é local e requer CI própria antes de integrar; nenhum novo commit/push/publicação foi realizado. Medições de desempenho e calibração em carga representativa não foram repetidas; não se afirma ganho ou ausência de custo da centralização. Os relatos e resultados das entregas anteriores permanecem históricos.
