# Etapa 2 — Análise independente da otimização

Relatório histórico da respectiva etapa. Código/comandos atuais e fechamento das pendências: [revisão da etapa 6](stage-6-final-review.md).

Data: 26/10/2026 (America/Cuiaba). Estado: implementação concluída e verificações locais aprovadas; CI remota pendente antes da integração. Sem alteração intencional de regra ou contrato público.

## Conferência da saída da etapa 1

Antes de editar produção, foram relidos AGENTS.md, plano, arquitetura, paridade e ADR 003. Conferidos [baseline/matriz](stage-1-baseline-and-rule-map.md), quatro decisões, 58 cenários compartilhados e logs anteriores (frontend 349, backend 354 e HTTP 15 aprovados). Reexecutado o backend ainda anterior à extração: **354/354**, [log](evidence/stage-2/backend-baseline.txt). A matriz distingue D1 reproduzida dos riscos não demonstrados. Portanto, a saída de caracterização permite a etapa 2; não pressupõe que D1 ou a intermitência operacional tenham sido corrigidas.

O checkout já continha a entrega da etapa 1 e alterações em README/arquitetura. Essas alterações foram preservadas. Etapas 3–6 não foram executadas. Ambiente: Windows win-x64, Node 24.17.0, .NET SDK 10.0.402 permitido por rollForward=latestFeature no global.json. Permanecem as limitações de ambiente registradas na etapa 1 (sem SDK exato 10.0.201, reinstalação limpa ou CI Linux/Node 22 nesta sessão).

## Responsabilidades após a extração

| Componente | Responsabilidade | Dependências |
| --- | --- | --- |
| ScheduleRules.Diagnose | Diagnóstico canônico já puro; permanece inalterado | Domain |
| [CoverageDemand](../../backend/EscalaLivre.Domain/Scheduling/CoverageDemand.cs) | Janelas de demanda, subdivisão por bordas e presença fora da pausa; usado também pelo modelo | Domain |
| [ScheduleCoverage](../../backend/EscalaLivre.Domain/Scheduling/ScheduleCoverage.cs) | Alocação por pessoa/função, blocos, união de lacunas e score | Domain |
| HiringDemand | Estimativas de contratação já puras, reutilizadas sem alteração | Domain |
| [ScheduleSuggestions](../../backend/EscalaLivre.Domain/Scheduling/ScheduleSuggestions.cs) | Sugestões de movimentação de pausas | Domain |
| [ScheduleExplanation](../../backend/EscalaLivre.Domain/Scheduling/ScheduleExplanation.cs) | Fatores e textos de decisão existentes, com o limite de 1000 | Domain |
| [ScheduleEvaluator](../../backend/EscalaLivre.Domain/Scheduling/ScheduleEvaluator.cs) | Uma avaliação pura: diagnóstico, cobertura, contratação e sugestões | Domain |
| ScheduleAnalyzer / ScheduleResultAssembler | Adaptar entrada do caso de uso e montar ScheduleResult | Application + Domain |
| AnalyzeSchedule / ValidateSchedule | Casos de uso distintos sobre o mesmo IScheduleAnalyzer, sem capacidade de otimizar | Application + Domain |
| GenerateSchedule | Invocar IScheduleOptimizer, avaliar documento completo e montar resultado/status/decisões | Application + Domain |
| [OrToolsScheduleOptimizer](../../backend/EscalaLivre.Infrastructure/Solver/OrToolsScheduleOptimizer.cs) | Implementar IScheduleOptimizer; candidatos, modelo, objetivo, execução e seleção | Infrastructure + Application + Domain + OR-Tools |
| OrToolsScheduleSolver | Fachada temporária de IScheduleSolver; delega análise/validação ao avaliador e geração ao caso de uso | Compatibilidade em Infrastructure |

Não foi criada uma segunda implementação de diagnóstico nem uma interface para cada função pura. A contratação já estava em Domain; foi retirada do solver sua orquestração. Os componentes extraídos não recebem ScheduleRequest/HTTP/CpModel; usam modelos de domínio, período e atribuições. A montagem do envelope interno ScheduleResult fica em Application, sem vazamento de tipos OR-Tools.

## Portas, consumidores e isolamento

[IScheduleAnalyzer](../../backend/EscalaLivre.Application/Scheduling/IScheduleAnalyzer.cs) expõe avaliação somente leitura. [IScheduleOptimizer](../../backend/EscalaLivre.Application/Scheduling/IScheduleOptimizer.cs) devolve atribuições completas, atribuições selecionadas, status e problemas do adaptador; não monta ScheduleResult. GenerateSchedule reaproveita a mesma porta de avaliação. Em sucesso explica somente as atribuições selecionadas; na falha conserva originais, agrega o problema do solver aos conflitos existentes e devolve decisões vazias, como antes.

[Composição](../../backend/EscalaLivre.Api/ServiceCollectionExtensions.cs): AddScheduleAnalysis registra avaliador, porta e casos de uso de leitura; AddScheduleOptimization acrescenta adaptador e geração. [CalculationWorker.ExecuteAsync](../../backend/EscalaLivre.Api/CalculationWorker.cs) compõe o primeiro conjunto em todos os filhos e o segundo apenas em solve. Analyze/validate não resolvem um otimizador. A fachada não é registrada no fluxo produtivo; seus consumidores restantes são os testes existentes e possíveis clientes internos legados.

O supervisor continua iniciando um processo por cálculo com o mesmo argumento de operação, protocolo JSON stdin/stdout, validação estrutural, limites, amostragem de memória e códigos de saída. Endpoints, envelopes, fila assíncrona, cancelamento e encerramento da árvore do processo não foram alterados. O executável API ainda referencia Infrastructure para sua composição e geração; a independência demonstrada é do avaliador e dos casos de uso, não uma remoção de pacotes do executável API.

## Evidências de preservação

Antes da extração foram capturados os **58 resultados completos** de Analyze com a implementação anterior, cultura invariável e ScheduleJson.CreateOptions. Os [hashes SHA-256 congelados](../../shared/analysis-baseline-hashes.json) incluem serialização de todas as propriedades: atribuições, diagnósticos e mensagens, ordem, cobertura, lacunas, contratação, sugestões, decisões, score e status. [Log da captura anterior](evidence/stage-2/capture.txt). Não são hashes de escalas ótimas alternativas.

[AnalysisContractTests](../../backend/EscalaLivre.Analysis.Tests/AnalysisContractTests.cs) compara os resultados de AnalyzeSchedule e ValidateSchedule entre si e contra esses hashes, além de verificar entrada imutável e status not-run. O teste não regenera o esperado usando o avaliador novo. Uma mudança intencional de serialização/regra requer decisão e revisão explícita dessa referência; não atualizar hashes para ocultar regressões.

O projeto [EscalaLivre.Analysis.Tests](../../backend/EscalaLivre.Analysis.Tests/EscalaLivre.Analysis.Tests.csproj) referencia somente Application entre os projetos de produção (Domain é transitivo). Um teste verifica o manifesto .deps.json, assemblies carregados e arquivos distribuídos, excluindo Infrastructure, API e Google.OrTools. Outro confirma a estimativa mensal de contratação. Os casos de geração usam doubles das portas para verificar avaliação única, histórico completo, decisões limitadas aos selecionados e falhas timeout/infeasible/invalid com preservação dos dados/conflitos.

No projeto de integração, SchedulingCompositionTests comprova que a composição de leitura não registra otimizador e que a geração resolve a nova porta sem fachada. A suíte anterior continua exercitando a fachada e OR-Tools real, incluindo a reprodução de D1. Por comparação de código, construção de candidatos e trecho de restrições/objetivo/parâmetros permaneceram iguais, exceto chamadas aos cálculos de demanda/presença extraídos. Não foram alterados pesos, grade, limites ou duração do CP-SAT. Helpers privados de cobertura sem consumidores foram removidos junto da extração.

## Verificações executadas

Comandos na raiz. A integração foi executada após as demais verificações para evitar concorrência com seu teste de timeout de 1s. TZ salvo/restaurado por try/finally.

| Verificação | Resultado | Log |
| --- | --- | --- |
| dotnet test backend/EscalaLivre.Tests/EscalaLivre.Tests.csproj -c Release, antes da edição | 354 aprovados | [baseline](evidence/stage-2/backend-baseline.txt) |
| dotnet test backend/EscalaLivre.Analysis.Tests/EscalaLivre.Analysis.Tests.csproj -c Release | 64 aprovados; sem Infrastructure/OR-Tools | [isolados](evidence/stage-2/analysis-tests.txt) |
| dotnet test backend/EscalaLivre.Tests/EscalaLivre.Tests.csproj -c Release | 356 aprovados, incluindo D1 e composição | [adaptador](evidence/stage-2/backend-final.txt) |
| node --test frontend/tests/*.test.cjs | 349 aprovados | [frontend](evidence/stage-2/frontend-final.txt) |
| Mesmo comando com TZ=America/New_York | 349 aprovados | [fuso](evidence/stage-2/frontend-new-york-final.txt) |
| npm --prefix frontend run lint | exit 0 | [lint](evidence/stage-2/lint-final.txt) |
| npm --prefix frontend run build | exit 0 | [build](evidence/stage-2/frontend-build-final.txt) |
| dotnet build backend/EscalaLivre.Api/EscalaLivre.Api.csproj -c Release | exit 0; zero avisos/erros | [API](evidence/stage-2/api-build-final.txt) |
| SECURITY_BUILD_CONFIGURATION=Release; node backend/security.integration.cjs | 15 aprovados | [HTTP/worker](evidence/stage-2/security-final.txt) |

A integração compara frontend, analyze e validate por diagnósticos, blocos, lacunas e score, também nas escalas geradas; verifica limites, cancelamento, desconexão, watchdog de memória e fila. A CI foi atualizada para executar também o projeto isolado; solução inclui ambos. Não foi disparada CI remota. Logs são evidência funcional, sem alegação de ganho de desempenho.

## Saída, rollback e pendências

Saída local da etapa 2 atendida: análise/validação funcionam apenas com Domain/Application e preservam os resultados anteriores; integração HTTP preservada. A fachada permite reversão incremental de consumidores, mas não mantém uma segunda cópia do avaliador. Rollback integral deve reverter somente os arquivos desta etapa, conservando a caracterização anterior.

- D1 continua reproduzida e não corrigida: cobertura do modelo ainda pode contar duas atribuições históricas da mesma pessoa. Impede afirmar equivalência global modelo/avaliador e concluir a etapa 5; não bloqueia esta extração.
- Permanece a investigação da intermitência do teste de fila de 1s observada na etapa 1; uma aprovação isolada não demonstra estabilidade temporal. Nenhum timeout foi ampliado para aprovar testes.
- Antes da integração, executar CI Linux/Node 22. O ambiente local usou roll-forward e dependências instaladas; não é evidência de instalação limpa ou SDK exato.
- Agregados/tipos, contratos dos regimes, decomposição matemática, rejeição de violações obrigatórias novas e retirada final de IScheduleSolver/fachada pertencem às próximas etapas. Não foram antecipados.
