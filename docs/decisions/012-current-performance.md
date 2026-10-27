# Desempenho atual e calibração local — 27/10/2026

A medição atual encontrou uma varredura repetida do histórico na leitura de cobertura. A única otimização de produção desta entrega é indexar os turnos por pessoa em ScheduleCoverage, mantendo a ordem das pessoas, todas as atribuições e os predicados de tempo/pausa/alocação. Nos cinco processos de cada versão, a análise de 20 mil turnos passou de 3.123,735 ms para 109,617 ms de mediana (aproximadamente 28,5 vezes, redução de 96,5%). O controle posterior em ordem alternada confirma o ganho na mesma máquina. Não há ganho global alegado: solver limitado a 5s e HTTP continuam predominando em outras cargas, e há alertas/regressões observadas abaixo.

## Identidade, ambiente e método

Baseline é o checkout de trabalho **atual antes desta otimização**, baseado em b8e88e32893336f2626bd0c557ef751c8fcd3b4d e incluindo os diffs locais de regimes e paridade. Não é o commit antigo da etapa 1 nem o binário de uma validação passada. [Manifesto baseline](evidence/performance-current/baseline-snapshot.json) e [manifesto depois](evidence/performance-current/after-snapshot.json) registram 97 arquivos de produção/contratos e ambiente; o único arquivo diferente entre eles é ScheduleCoverage.cs. O [fonte anterior](evidence/performance-current/baseline-ScheduleCoverage.cs.txt) está preservado. Não houve commit/push nesta entrega.

Ambiente: Intel(R) Core(TM) i5-10505 CPU @ 3.20GHz, 12 processadores lógicos, 15.74 GiB RAM, Windows 10.0.26100, SDK 10.0.402/MSBuild 18.9.15/runtime 10.0.13, Node v24.17.0, npm 11.13.0, OR-Tools 9.12.4544. global.json permite latestFeature; não se afirma execução do SDK 10.0.201 exato. DOTNET_PROCESSOR_COUNT=1, OMP_NUM_THREADS=1, DOTNET_TieredCompilation=0, TZ=America/Cuiaba iguais nas duas versões. Não houve pinagem de CPU/reserva de máquina. O runtime controlado, inclusive tiering desligado no servidor do experimento, não constitui uma medição literal de todo ambiente de produção.

Fontes foram copiados para diretórios novos em Documents, instrumentados simetricamente nas cópias e compilados Release com -t:Rebuild. Nenhuma sonda entrou nos projetos produtivos do checkout. [Ferramenta](../../tools/performance-benchmark.cjs), [sonda de fases](../../tools/performance/PhaseProbe.cs), [sonda do modelo](../../tools/performance/ModelProbe.cs) e [programa](../../tools/performance/Program.cs) ficam versionados em tools. Marcadores ausentes fazem a preparação falhar; não se executam DLLs antigas como substituição de compilação atual.

Cada caso/operação tem cinco processos novos por versão: uma chamada de aquecimento, GC antes da amostra e uma chamada medida (70 amostras por versão). coldMs é a primeira chamada, não startup do executável. A primeira coorte baseline precedeu a coorte depois; controles adicionais em cinco pares alternaram a ordem em três caminhos (30 amostras). Nenhum build/teste/benchmark de CPU concorrente durante as amostras. Build logs: [baseline](evidence/performance-current/baseline-core-build.txt), [depois](evidence/performance-current/after-core-build.txt). Os dados não estimam p95/p99 nem estabilidade entre dias/máquinas.

Tempos de diagnóstico/cobertura são medidos dentro de ScheduleEvaluator. candidates inclui materialização da geração preguiçosa e ScheduleModelInput; model inclui variáveis/tradutores/objetivo. Cada tradutor tem linha própria no bruto. solver inclui interop/marshalling de Solve; wallSeconds nativo também é registrado. Captura de tamanho protobuf fica separada em modelMetrics, exceto falha parcial de tradução, cujo capture consta do caminho abortado. Fases aninhadas não devem ser somadas duas vezes.

Memória por fase é alocação **gerenciada**, não alocação nativa. GC.GetTotalAllocatedBytes(true) mede a chamada total; amostras de fase com false têm granularidade de blocos. Private bytes/working set antes/depois e pico OS são do processo inteiro; o pico inclui inicialização, aquecimento e memória nativa, não é pico exclusivo de cada fase. CPU total tem granularidade do SO (valores zero em chamadas pequenas não significam custo nulo). No HTTP, o pai é amostrado a cada 50ms por processo auxiliar; o worker usa as amostras do watchdog existente de 50ms, sem aumentar seus limites. Esses picos amostrados são limites inferiores e não podem ser somados como se fossem simultâneos. Bytes protobuf incluem nomes; não representam a memória nativa do modelo.

## Entradas sintéticas e limites

[Gerador](../../shared/performance-scenarios.cjs), [dimensões/hashes](evidence/performance-current/baseline-cases.json) e [entradas completas comprimidas](evidence/performance-current/inputs.json.gz). Identidades, datas, cadastros e preferências são sintéticos e fixos, sem dados pessoais. Um teste refaz o corpus e compara o hash, limites e unicidade. IDs internos de candidatos continuam os aleatórios do produto; não se mudou a busca para obter uma escala exata.

| Caso | Pessoas | Dias | Pausas | Linhas de cobertura | Turnos salvos | Bytes JSON |
| --- | --- | --- | --- | --- | --- | --- |
| small-fixed | 4 | 7 | fixed | 7 | 28 | 13830 |
| fortnight-history | 12 | 14 | fixed | 21 | 48 | 27548 |
| variable-breaks | 4 | 3 | variable | 21 | 0 | 6143 |
| max-people-period | 200 | 31 | none | 7 | 0 | 114815 |
| candidate-limit | 200 | 31 | variable | 7 | 0 | 109415 |
| near-candidate-limit | 80 | 3 | variable | 21 | 0 | 46954 |
| coverage-limit | 40 | 31 | fixed | 1000 | 1240 | 591480 |
| history-limit | 200 | 31 | none | 7 | 20000 | 5754814 |

O período começa em 12/10/2026; feriados reais do calendário existente permanecem ativos, por isso o número de candidatos não é simplesmente pessoas × dias. fixed alterna pausas 12–13h/13–14h; variable conserva entradas e durações de pausa pesquisadas pelo produto; none tem máximo de pausa explicitamente zero e jornada de 4h. Essa última configuração foi corrigida durante o piloto, antes do baseline formal, pois máximo 2h permitia alternativas com pausas e não isolava ausência de pausa.

fortnight-history tem histórico nos dois lados; history-limit tem 100 turnos externos por pessoa (50 antes/50 depois), totalizando o limite estrutural de 20 mil. coverage-limit exercita 1000 linhas sobrepostas em três funções, agrupadas pelo contrato de demanda; não equivale a 1000 funções independentes. Algumas escalas salvas têm conflitos de negócio, inclusive feriados/semana: continuam carregáveis e integralmente presentes nos diagnósticos. As respostas completas de leitura devem conservar esses conflitos.

coverage-limit e history-limit são cargas de leitura; não foi medida geração com 1000 linhas ou 20 mil turnos. O modelo é exercitado pelas demais seis cargas, incluindo a proximidade dos limites de candidatos/passos. Essa separação não demonstra latência de solve em todas as combinações estruturais máximas.

200 pessoas/31 dias, 1000 exigências e 20 mil atribuições são dimensões estruturais, não promessa de solve de qualquer combinação. near-candidate-limit chega a 29.920 candidatos e é rejeitado no passo tentado 300.001; candidate-limit para em 30.001 candidatos. Limites continuam 30.000 candidatos, 300.000 passos, CP-SAT 5s/um worker, worker 12s/512MiB. A entrada de 20 mil turnos tem 5,75 MB e é corretamente rejeitada por HTTP 413 pelo limite distinto de 2MiB; sua análise é medida diretamente. Não se elevou nenhum limite para fazê-la passar pela API.

## Resultados principais

Medianas; alocação/pico em MiB. [Bruto antes](evidence/performance-current/baseline-samples.json), [depois](evidence/performance-current/after-samples.json), [comparação com mínimo/máximo/MAD e alertas](evidence/performance-current/comparison.json).

| Caso/operação | Tempo ms antes → depois | Gerenciado MiB antes → depois | Pico processo MiB antes → depois |
| --- | --- | --- | --- |
| small-fixed / analyze | 0.471 → 0.507 | 0.27 → 0.25 | 43.94 → 43.95 |
| small-fixed / solve | 21.991 → 21.508 | 1.45 → 1.33 | 62.52 → 62.39 |
| fortnight-history / analyze | 1.503 → 1.031 | 0.95 → 0.81 | 45.85 → 45.64 |
| fortnight-history / solve | 5028.977 → 5026.420 | 10.85 → 10.72 | 92.73 → 93.16 |
| variable-breaks / analyze | 0.224 → 0.225 | 0.09 → 0.09 | 43.48 → 43.47 |
| variable-breaks / solve | 5238.885 → 5241.041 | 95.82 → 95.81 | 214.62 → 214.35 |
| max-people-period / analyze | 1.722 → 1.284 | 2.58 → 0.47 | 50.68 → 48.42 |
| max-people-period / solve | 2249.623 → 2007.747 | 473.02 → 470.62 | 201.89 → 199.85 |
| candidate-limit / analyze | 4.561 → 2.587 | 6.12 → 0.83 | 54.11 → 48.61 |
| candidate-limit / solve | 61.127 → 67.847 | 69.77 → 69.77 | 58.55 → 58.59 |
| near-candidate-limit / analyze | 0.441 → 0.412 | 0.49 → 0.34 | 45.82 → 45.74 |
| near-candidate-limit / solve | 963.666 → 1002.682 | 389.07 → 389.07 | 162.30 → 162.36 |
| coverage-limit / analyze | 106.604 → 55.541 | 24.36 → 23.34 | 64.82 → 64.84 |
| history-limit / analyze | 3123.735 → 109.617 | 45.66 → 43.98 | 177.91 → 177.87 |

Fases do solve em ms; coverage é a leitura final na admissão, ausente nas rejeições anteriores ao solver:

| Caso | Candidatos antes → depois | Modelo antes → depois | Solver antes → depois | Cobertura final antes → depois |
| --- | --- | --- | --- | --- |
| small-fixed | 0.232 → 0.227 | 0.883 → 0.909 | 19.971 → 19.727 | 0.240 → 0.211 |
| fortnight-history | 0.446 → 0.451 | 10.889 → 9.783 | 5012.823 → 5013.140 | 2.912 → 1.300 |
| variable-breaks | 2.785 → 2.819 | 147.187 → 155.102 | 5075.519 → 5076.213 | 0.152 → 0.169 |
| max-people-period | 251.068 → 262.000 | 171.449 → 168.187 | 1501.696 → 1536.082 | 320.822 → 5.380 |
| candidate-limit | 61.115 → 67.834 | 0.000 → 0.000 | 0.000 → 0.000 | 0.000 → 0.000 |
| near-candidate-limit | 66.691 → 69.375 | 897.464 → 934.363 | 0.000 → 0.000 | 0.000 → 0.000 |

| Caso solve | Candidatos | Variáveis | Restrições | Bytes protobuf | Passos | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| small-fixed | 24 | 330 | 636 | 35537 | 252 | optimal |
| fortnight-history | 168 | 3587 | 6476 | 422370 | 2522 | feasible |
| variable-breaks | 1496 | 3120 | 70452 | 3540939 | 102648 | feasible |
| max-people-period | 5800 | 29232 | 60948 | 3908752 | 23316 | optimal |
| candidate-limit | 30001 | 0 | 0 | 0 | 0 | complexityLimit |
| near-candidate-limit | 29920 | 33712 | 233411 | 14051632 | 300001 | complexityLimit |

O [resumo de qualidade](evidence/performance-current/quality-summary.json) preserva status, intervalo de score, objetivos e melhores bounds. Nas amostras viáveis, scores/objetivos permaneceram iguais nos dois lados; os casos feasible não provaram otimalidade e não se exige a mesma seleção de turnos. O programa reavalia a proposta, exige ausência de novos erros obrigatórios e preservação na falha; a entrada é conferida contra mutação em cada amostra.

Os tamanhos/contagens acima são idênticos antes/depois em todas as repetições, inclusive modelo parcial rejeitado. As restrições, objetivo, prioridades e pesos não foram alterados. O perfil baseline do histórico tinha cerca de 3.036ms em cobertura e 85ms em diagnóstico; o índice elimina a procura de cada pessoa em toda a lista, trocando-a por consulta somente aos seus turnos. Não filtra história por período, não funde sobreposições, não conta turnos como pessoas e não muda bordas/pausas. Os hashes completos dos oito casos de análise são iguais em todas as amostras de ambas as versões.

No caso de 200 pessoas/31 dias, há ganho também na análise final da proposta, mas solver e geração permanecem custos grandes. Pausas variáveis gastam o orçamento nativo de 5s e a tradução de cobertura domina a construção de seu modelo. Não se tentou reduzir alternativas, prioridades, precisão, número de passos instrumentados nem qualidade do objetivo. Otimizar esses caminhos exige experimento separado; o índice de leitura foi suficiente para corrigir o gargalo comprovado sem refazer o modelo.

### Variação e controles

Há alerta na primeira coorte small-fixed/analyze (0,471 → 0,507ms; depois 0,417–1,153ms) e na rejeição por candidatos (61,127 → 67,847ms). O segundo caminho termina antes da cobertura otimizada; não se atribui causalmente essa mudança ao índice. O diagnóstico sem mudança também variou. Não se apagam essas amostras nem se escolhe somente a execução favorável. [Pares alternados](evidence/performance-current/paired-samples.json):

| Controle | Mediana ms antes → depois | Faixa antes | Faixa depois |
| --- | --- | --- | --- |
| small-fixed / analyze | 0.476 → 0.452 | 0.447–0.504 | 0.425–0.592 |
| candidate-limit / solve | 71.068 → 68.798 | 69.455–73.921 | 68.197–71.582 |
| history-limit / analyze | 3416.774 → 120.441 | 3391.491–3633.105 | 111.301–181.691 |

O ganho grande de histórico persiste; a sobreposição das faixas pequenas e a deriva de um caminho sem alteração impedem um gate portátil de latência. Pico de processo/private bytes podem crescer em alguns casos apesar da queda de alocação gerenciada; o dado bruto e os alertas os preservam. Não se afirma redução universal de memória.

## HTTP, fila e worker reais

[Antes](evidence/performance-current/baseline-http-samples.json), [depois](evidence/performance-current/after-http-samples.json). Três servidores novos por versão, readiness separado, aquecimento analyze/solve, uma medida síncrona de cada e um burst de três jobs. Limites de proteção são os padrões, incluindo um worker, fila 20, 12s/512MiB, seis solves/minuto e body 2MiB; o experimento usa cinco solves por servidor. Consultas a cada 100ms são tráfego do instrumento, não alteração do polling da interface.

| Medida | Mediana antes → depois |
| --- | --- |
| /analyze | 598.479 → 582.945 ms |
| /solve | 6319.567 → 5913.550 ms |
| queue | 18337.555 → 18261.185 ms |
| parentMiB | 72.92 → 72.53 MiB |

Os registros de fila trazem espera e processamento separados por job em milissegundos; elapsed do cliente inclui admissão, transporte e polling. workers traz duração do processo supervisionado e pico amostrado; processamento da fila inclui retenção/serialização da resposta. Não se usam os segundos inteiros/estimativas de JobProgress como tempo preciso. Todos os nove jobs de cada versão foram concluídos; as saídas viáveis foram reanalisadas em TS por diagnóstico completo, cobertura/lacunas/score, sem comparar a seleção exata. Tokens privados não são persistidos.

O ganho da leitura não remove startup de worker nem os 5s de busca. As faixas HTTP são largas e a mudança de mediana não fundamenta ganho de throughput/SLO. O ensaio é um burst de três, não saturação sustentada da fila 20, teste com múltiplas instâncias ou capacidade de serviço em Linux. A proteção de timeout/memória/rejeição/recuperação permanece na suíte funcional.

## Limites de regressão e CI

[regression-budget.json](evidence/performance-current/regression-budget.json) contém envelopes **da versão otimizada**, por entrada/operação: n, mínimo, mediana, máximo e MAD para tempo, alocação, pico e medidas HTTP/fila. Os três casos com controles alternados usam as dez amostras da versão otimizada (cinco principais + cinco controles), incluindo o outlier de histórico de 181,691ms; os demais usam cinco, HTTP usa três servidores. A [coorte de calibração](evidence/performance-current/calibration-samples.json) preserva a união das 85 amostras, sem apagar as duas coortes originais. O limiar é o máximo observado; uma futura mediana acima dele gera alerta de investigação. Não se escolheu percentual arbitrário. [Alertas contra a coorte antiga](evidence/performance-current/baseline-envelope-alerts.json) mantêm os aumentos observados. Contagens/tamanho do modelo são invariantes deste experimento, não proibição de futuras otimizações justificadas do modelo.

[performance-alerts.cjs](../../tools/performance-alerts.cjs) confere ambiente/SDK/runtime e hashes de entrada; diferenças marcam uncalibratedEnvironment/differentInputs. Não encerra CI por latência/memória. O [workflow manual](../../.github/workflows/performance.yml) coleta em Ubuntu/Node 22, publica entradas/resultados e sinaliza que o orçamento Windows não está calibrado para esse ambiente. Não foi disparado nem publicado nesta sessão. Execução/validação do instrumento pode falhar por erro real; números de desempenho são alertas, sem gate universal.

### Reproduzir

Na raiz, SDK/dependências disponíveis e diretórios de saída novos:

~~~powershell
node tools/performance-benchmark.cjs snapshot . C:\Temp\escala-antes
node tools/performance-benchmark.cjs build C:\Temp\escala-antes
node tools/performance-benchmark.cjs measure C:\Temp\escala-antes 5
# Após uma alteração de produção, sem mudar entradas ou ambiente:
node tools/performance-benchmark.cjs snapshot . C:\Temp\escala-depois
node tools/performance-benchmark.cjs build C:\Temp\escala-depois
node tools/performance-benchmark.cjs measure C:\Temp\escala-depois 5
node tools/performance-benchmark.cjs compare C:\Temp\escala-antes C:\Temp\escala-depois C:\Temp\escala-comparacao
node tools/performance-paired.cjs C:\Temp\escala-antes C:\Temp\escala-depois C:\Temp\escala-comparacao
node tools/performance-http.cjs C:\Temp\escala-antes 3
node tools/performance-http.cjs C:\Temp\escala-depois 3
node tools/performance-alerts.cjs calibrate C:\Temp\escala-depois > C:\Temp\budget.json
node tools/performance-alerts.cjs check C:\Temp\budget.json C:\Temp\nova-amostra
~~~

Para recomputar exatamente o orçamento publicado, use a união calibration-samples.json como samples.json em uma pasta de calibração com after-snapshot.json renomeado snapshot.json, after-cases.json como cases.json e after-http-samples.json como http-samples.json, e execute calibrate nessa pasta. O comando sobre uma coorte nova de cinco produz somente o envelope dessa coorte.

snapshot só copia para pasta nova e não remove/edita fontes do checkout. Para reproduzir especificamente o lado anterior desta entrega a partir do checkout otimizado, crie seu snapshot, substitua **somente na cópia** backend/EscalaLivre.Domain/Scheduling/ScheduleCoverage.cs pelo fonte anterior anexado e registre esse override/sha no manifesto de reprodução antes do build; os demais 96 hashes e inputs devem coincidir com o baseline anexo. Fontes, runtime ou instrumentação diferentes constituem outro experimento. Os snapshots completos originais permanecem em Documents/escalalivre-performance-data/baseline-current e after-current; o repositório preserva manifestos, fonte alterado, entradas comprimidas e dados necessários à conferência.

## Falhas do instrumento, correção e aceite

A preparação teve erro de escape no gerador de ferramenta, corrigido antes de qualquer amostra; o primeiro build foi bloqueado pelo acesso sandbox ao NuGet.Config e repetido com execução autorizada. São falhas de ambiente/instrumento. O piloto de ausência de pausa foi ajustado antes do baseline formal, sem mudar as duas entradas comparadas posteriormente.

Na primeira rodada HTTP, Console.In.ReadLineAsync no coletor impediu a amostragem concorrente: memória do pai tinha zero amostras e é **indisponível**, não zero bytes reais. Os registros iniciais ficam preservados como [baseline indisponível](evidence/performance-current/baseline-http-initial-parent-memory-unavailable.json)/[depois indisponível](evidence/performance-current/after-http-initial-parent-memory-unavailable.json), fora da comparação final. O coletor passou a usar uma thread de leitura separada, ambas as cópias foram recompiladas e as três repetições HTTP de cada lado foram refeitas; agora a ferramenta exige amostras e eventos completos. Somente o ramo monitor mudou; o código da operação core medida permaneceu idêntico. O programa core original também está anexado. Logs dos rebuilds HTTP: [antes](evidence/performance-current/baseline-build.txt), [depois](evidence/performance-current/after-build.txt).

Regras, formato, segundos, histórico, objetivo, limites e admissão continuam preservados; a nova regressão pura cobre índice com sobreposição, pausa, ordem invertida e pessoa desconhecida sem duplicar capacidade. A validação funcional completa e a identidade dos fontes estão na seção complementar abaixo.

**Aceite integral continua aberto:** a medição representativa local está atendida, mas ambiente alvo/Linux, sessões independentes suficientes para estabilidade e CI própria do diff ainda precisam de evidência. Não se encerra a etapa 6 nem se transforma os limites medidos localmente em SLO. Não houve push para disparar CI.

## Validação funcional posterior

Rebuild Release da solução atual aprovado, zero avisos/erros; testes .NET **639** (239 domínio/aplicação, 379 adaptador real, 8 API, 13 arquitetura). Frontend **469** em Cuiabá e **469** em Nova York; diferencial **142** entradas em cada fuso; lint, build frontend e build API passaram; HTTP/worker funcional **16/16**, sem falhas/ignorados. As entradas/hashes de paridade anteriores permanecem iguais. A nova regressão de índice e o corpus sintético estão incluídos nessas contagens.

[Comandos/horários/códigos](evidence/performance-current/validation/results.json), [fontes validados](evidence/performance-current/validation/source-manifest.json) (257 arquivos SHA-256, reconferidos após as suítes), [rebuild](evidence/performance-current/validation/solution-build.txt), [domínio/aplicação](evidence/performance-current/validation/analysis.txt), [adaptador](evidence/performance-current/validation/adapter.txt), [API](evidence/performance-current/validation/api.txt), [arquitetura](evidence/performance-current/validation/architecture.txt), [frontend](evidence/performance-current/validation/frontend.txt), [frontend NY](evidence/performance-current/validation/frontend-new-york.txt), [diferencial](evidence/performance-current/validation/differential.txt), [diferencial NY](evidence/performance-current/validation/differential-new-york.txt), [lint](evidence/performance-current/validation/lint.txt), [build frontend](evidence/performance-current/validation/frontend-build.txt), [build API](evidence/performance-current/validation/api-build.txt), [HTTP](evidence/performance-current/validation/http-worker.txt). As sondas nativas foram compiladas somente nos snapshots; [identidade dos instrumentos](evidence/performance-current/instrumentation-manifest.json).

O [teste do instrumento de alertas](evidence/performance-current/alert-tool-check.json) injeta regressão de tempo e ambiente diferente, verifica ambos os alertas e confirma exit code zero. O orçamento final incorpora a variação dos controles; não foi limitado à primeira coorte mais rápida. Nenhuma variável Protection__ foi herdada no ambiente de medição; os valores registrados correspondem ao appsettings padrão das cópias.

CI remota reconferida: [Validate #22](https://github.com/argemon/escalalivre/actions/runs/40377752675), SHA b8e88e32893336f2626bd0c557ef751c8fcd3b4d, completed/success ([registro](evidence/performance-current/remote-ci.json)). Ela cobre o baseline publicado anterior, sem o diff local de regimes/paridade/desempenho. A CI própria e a execução manual de desempenho em Ubuntu continuam pendentes antes de integrar. Não houve publicação, push ou disparo de workflow.
