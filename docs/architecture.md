# Arquitetura atual

Estado em 26/10/2026: implementação das seis etapas verificada localmente. Revalidação dos fontes e CI remota para o código de d40f887 conferidas em 26/10/2026, conforme [evidências atuais](decisions/stage-6-current-validation.md). Aceite integral do plano permanece aberto para calibração de desempenho em carga representativa. O [relatório final](decisions/stage-6-final-review.md) distingue implementação, evidência e limitações; os relatórios anteriores são históricos.

Seguimento em 26/10/2026: [fronteiras operacionais validadas](decisions/009-validated-operational-boundaries.md) reforça unidades/configuração na geração e a saída do agregado. Validação local atual: 612 testes .NET, 373 frontend em cada fuso e 16 HTTP. A CI verde de d40f887 é evidência do baseline; não cobre este diff local, cuja CI permanece pendente antes de integrar.

Seguimento em 27/10/2026: [extensibilidade dos regimes](decisions/010-regime-extension-boundaries.md) centraliza capacidades e metadados dos regimes, mantendo o contrato público fechado em dayBased/hourBased. Validação local: 623 testes .NET, 381 frontend em cada fuso e 16 HTTP. A CI [Validate #22](https://github.com/argemon/escalalivre/actions/runs/40377752675) de b8e88e3 foi conferida com sucesso; ela é o baseline e não cobre o novo diff local. CI do novo diff continua necessária antes de integrar.

## Camadas e dependências

| Projeto | Responsabilidade e dependências |
| --- | --- |
| EscalaLivre.Domain | Valores/unidades, configuração de regime, agregado de planejamento, políticas e avaliação puras. Sem referências de projeto/pacote, JSON, HTTP, DI ou OR-Tools. |
| EscalaLivre.Application | DTOs/mapeadores, validação estrutural, comandos e casos de uso, portas IScheduleAnalyzer/IScheduleOptimizer e montagem do resultado. Depende de Domain. |
| EscalaLivre.Infrastructure | Geração/CP-SAT e importação/exportação. Implementa a porta de otimização; depende de Domain/Application. |
| EscalaLivre.Api | Transporte, composição, fila/supervisor e execução do worker. Compõe as outras três camadas; não decide regras. |

Os testes de arquitetura verificam referências de assembly/projeto, imports das camadas internas e tipos exportados, incluindo arrays, genéricos, atributos, eventos e constraints. Tipos de OR-Tools/PDF não aparecem na superfície pública dos projetos. O modelo, variáveis, termos, execução nativa e leitura que usam esses tipos ficam internos a Infrastructure; apenas o projeto de testes do adaptador recebe acesso aos internos necessários.

## Modelo e operações

Domain.Planning contém CivilWindow, ShiftPause, CivilPlanningPeriod, Duration/DayCount/WholeHours/WeeklyHours e as variantes de RegimeConfiguration. Construção validada protege estrutura/segundos civis/unidades. ScheduledAssignment protege identidade; PlanningSchedule oferece atribuir, atualizar, remover, mover, mudar período e substituir um período de forma atômica. PlanningSettings mantém configuração em snapshot imutável separado e resolve a herança em RegimeFor. Gerador e tradutores de descanso/ciclo/semana consomem RegimeConfiguration/Duration/DayCount/WeeklyHours; o modelo conserva a projeção de configuração correspondente ao mesmo snapshot. Não há banco de dados/repositório nem agregado gigante do arquivo inteiro.

ScheduleModels contém projeções de leitura para políticas/portas; elas não são o agregado protegido. A presença de primitivos e records nesses contratos de leitura não implica garantia de consistência por mutação direta. Application.Contracts.Documents contém DTOs do arquivo e mapeadores explícitos; PlanningDocumentMapping cruza a fronteira das operações protegidas. JSON camelCase, IDs/opcionais, versões, tempo civil e migrações idempotentes permanecem compatíveis.

Conflito de negócio não é impossibilidade estrutural. Turnos com descanso, jornada ou pausa em conflito continuam recuperáveis/editáveis/diagnosticáveis. Mudanças cadastrais preservam horários; a edição explícita da função atualiza a função dos turnos como previsto. PlanningEditor orquestra comandos internos sem introduzir endpoints.

## Avaliação e políticas

ScheduleRules monta os diagnósticos, mantendo ordem e redação; usa EffectiveWorkPolicy, RestPolicy, DayCyclePolicy, IntervalPolicy, AvailabilityPolicy e ShiftEligibilityPolicy. ScheduleCapacityPolicy fornece saldos para a tradução matemática. LaborRules concentra feriados/autorizações; ScheduleWindow concentra propriedade por data inicial, substituição e calendário semanal. Os helpers de delegação temporários foram removidos após migrar consumidores.

ScheduleEvaluator compõe diagnóstico, ScheduleCoverage/CoverageDemand, HiringDemand e ScheduleSuggestions. ScheduleExplanation descreve seleções. AnalyzeSchedule e ValidateSchedule usam o mesmo IScheduleAnalyzer/ScheduleAnalyzer, sem Infrastructure/OR-Tools; a independência também é verificada no deployment do projeto de testes puro.

RegimeConfiguration concentra o mapeamento dos tipos públicos e declara MaximumShiftWork, RestBetweenShifts e RollingCycle. DayCycleLimit contém somente as invariantes do ciclo, sem referência ao regime. Diagnóstico, geração, admissão e tradução selecionam famílias por essas capacidades; RegimeEligibility compõe as verificações parciais. IsSupported e From usam o mesmo mapa canônico. No cliente, types/schedule.regimeTypes define o contrato fechado e lib/regimes concentra restrições, nomes e rótulos.

IShiftRegime é uma capacidade parcial: dias verifica ciclo de datas iniciais; horas verifica trabalho líquido e descanso do regime. Não substitui diagnóstico global. EstimateStartAfterRest é estimativa local sem garantia de elegibilidade com histórico. ShiftRegimeFactory recebe estratégias registradas na API e rejeita desconhecidos/duplicações conforme o [ADR 006](decisions/006-scheduling-policies-and-regime-contracts.md).

## Geração e aplicação

OrToolsScheduleOptimizer coordena ScheduleCandidateGenerator, OptimizationBudget/ScheduleModelInput, ScheduleModelBuilder, OrToolsExecution e ScheduleResultReader. As seis famílias FixedAssignment/DailyExclusivity/Rest/WeeklyWork/DayCycle/CoverageConstraints são registradas na composição. ScheduleObjective concentra os coeficientes. Os componentes são sem estado; modelo e orçamento são por cálculo.

Preservados: grade de entradas/pausas, margens operacionais, 30.000 candidatos incluindo fixos, 300.000 passos instrumentados, 5s/um worker CP-SAT e prioridades/pesos. Cobertura é objetivo com déficit permitido; uma solução parcial pode ser viável/ótima. A correção separada D1 usa presença por pessoa, sem remover atribuições históricas sobrepostas.

GenerateSchedule só admite optimal/feasible após conferir estrutura/fronteira de planejamento e analisar a proposta completa. GenerationConformance distingue atribuições idênticas retidas e participação nova em conflitos agregados; um código herdado não autoriza agravar semana/ciclo/descanso. Falha preserva documento, retorna invalid/solverInvalid e decisions vazio. Não se aplica parcialmente um lote rejeitado. Na geração aceita, a aplicação devolve o snapshot imutável exportado por PlanningSchedule, incluindo tags, e monta decisões a partir das seleções admitidas. Não devolve o contêiner mutável do otimizador; histórico/IDs/horários/metadados são preservados por valor. A porta e as duas classes de fachada/composição legada foram removidas após equivalência de 581 casos.

## Worker, frontend e arquivo local

CalculationWorker mantém cada cálculo em processo filho, com protocolo JSON stdin/stdout, supervisão, limites e cancelamento anteriores. Só solve registra a otimização; analyze/validate resolvem leitura. A fila/token privado, prazos e liberação de slots não foram substituídos por execução no processo HTTP.

Seguimento de 31/10/2026: a fila distingue admissão, execução e retenção. O
orçamento de payload UTF-8 reserva 4 MiB por ativo e contabiliza bytes reais dos
resultados concluídos, com teto padrão de 128 MiB e 1.024 tickets. Retenção de dois
minutos é preservada sem remoção antecipada; `TimeProvider` permite controlar
expiração/limpeza nos testes. Esses limites não medem RSS/heap. Decisão e evidências:
[orçamento de retenção](decisions/014-job-retention-budget.md).

No frontend, componentes apresentam, Zustand coordena estado/recuperação e lib contém análise/construção local. As políticas em lib/policies não dependem de React/Zustand/HTTP/browser nem de chamadas de relógio local do dispositivo. São implementações distintas das políticas C#, verificadas por 58 documentos de paridade, 20 contratos de regime e dois casos de D1. A construção de pausa usa os mesmos limites variáveis da política; aliases temporários foram removidos. O arquivo .escalalivre continua fonte portátil local-first, sem cadastro/persistência de servidor.

## Validação e evolução

Testes puros, adaptador, API, arquitetura e HTTP possuem execuções separadas, conforme [guia de validação](testing.md). CI tem jobs separados e mantém o gate backend para compatibilidade com o nome anterior. Não houve publicação/integração nesta sessão.

Medição exploratória reproduz baseline/final isolados com ferramentas iguais e duas entradas antigas; resultados mistos, sem ganho global demonstrado. Metodologia/dados em [desempenho](decisions/stage-6-performance.md). Limites representativos de regressão continuam pendentes. A execução remota Validate #20 foi conferida, com todos os jobs verdes e merge de teste sem diferença de arquivos para d40f887; configuração de workflow por si só não foi tratada como evidência.
