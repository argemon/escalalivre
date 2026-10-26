# Medição exploratória da etapa 6

Atualização de validação em 26/10/2026: a [revalidação atual](stage-6-current-validation.md) recompilou e testou o código de d40f887 e conferiu a CI remota. Não foram repetidas medições de desempenho nesta rodada. Dados, manifesto e conclusões abaixo continuam sendo o experimento retrospectivo original; a aprovação funcional/CI não calibra os alertas em carga representativa. Essa pendência permanece aberta.

Reprodução em 2026-10-26T15:18:56.329Z, no mesmo computador Windows/SDK 10.0.402. Baseline: commit 66659daa2bbfc2384605946ec5b553e0bcd51eed, cujo código de produção era o ponto de partida da etapa 1 (as alterações anteriores eram documentais). Snapshot final: manifesto SHA-256 no JSON. Ferramentas/lockfiles/fixtures iguais, compilação Release, sem builds/testes concorrentes durante as amostras.

Seguimento do código: o [ADR 009](009-validated-operational-boundaries.md) acrescenta validação de configuração e snapshots de saída após este experimento. Não houve nova medição de desempenho nesta entrega; os números/manifesto abaixo não caracterizam o novo diff. Calibração representativa permanece pendente.

## Método e alcance

- Dois cenários existentes: baseline-eight-work-hours e four-hours-no-legal-break; analyze/solve em ambas as versões. São entradas antigas compartilhadas, não cenários escolhidos com horários alterados para melhorar números.
- Cinco pares por cenário/operação: processos novos, uma primeira chamada para aquecimento e uma medida por processo; ordem baseline/final alternada, 40 amostras medidas. GC antes da medida; DOTNET_PROCESSOR_COUNT=1, OMP_NUM_THREADS=1, tiered compilation desligada e TZ=America/Cuiaba nas duas versões. CP-SAT mantém seus 5s/um worker.
- Fonte original reconstruído por git show e fonte final copiado, sem editar o checkout. Instrumentação simétrica imediatamente antes da solução captura variáveis, restrições e tamanho serializado do protobuf. Inclui nomes de variáveis; não é memória nativa do modelo.
- Medição da chamada de capacidade completa, sem HTTP/fila/inicialização do executável; final usa os registros reais da API e casos de uso. coldMs no dado bruto é a primeira chamada da capacidade, não startup do servidor. Alocação é gerenciada; peakWorkingSet é máximo do processo incluindo inicialização/aquecimento, não alocação isolada da operação.
- Analyze confere o hash completo congelado em cada amostra; solve exige status viável/ótimo, ausência de erro obrigatório e não mutação da entrada. Não se compara a mesma escala entre ótimos alternativos.

## Resultados (medianas)

| Entrada / operação | Tempo ms baseline → final | Bytes gerenciados baseline → final | Pico working set MiB baseline → final | Modelo variáveis/restrições/bytes baseline → final |
| --- | --- | --- | --- | --- |
| baseline-eight-work-hours / analyze | 0.270 → 0.338 | 39968 → 40808 | 40.20 → 41.35 | não há modelo |
| baseline-eight-work-hours / solve | 14.079 → 7.028 | 1137784 → 832216 | 60.71 → 59.35 | 396/744/50758 → 106/476/23989 |
| four-hours-no-legal-break / analyze | 0.328 → 0.319 | 37032 → 38000 | 40.13 → 41.36 | não há modelo |
| four-hours-no-legal-break / solve | 1.256 → 1.538 | 179504 → 219008 | 57.68 → 57.79 | 19/35/1630 → 23/43/2082 |

| Entrada / operação | Faixa baseline ms | Faixa final ms | Mediana final excede máximo observado do baseline? |
| --- | --- | --- | --- |
| baseline-eight-work-hours / analyze | 0.258–0.353 | 0.294–0.410 | não |
| baseline-eight-work-hours / solve | 13.989–14.732 | 6.750–7.526 | não |
| four-hours-no-legal-break / analyze | 0.314–0.382 | 0.311–0.330 | não |
| four-hours-no-legal-break / solve | 1.224–1.429 | 1.519–2.151 | sim |

O resultado é misto. O modelo de 8h ficou menor, enquanto o de 4h cresceu e sua mediana de solução excedeu a faixa anterior. A nova representação de presença por pessoa pode reduzir variáveis de alocação por alternativa ou acrescentar variáveis de presença; a admissão acrescenta trabalho de validação. A comparação não isola causalmente cada mudança e **não demonstra ganho global de desempenho**.

Os máximos observados são limites de alerta locais derivados do baseline, registrados por métrica no JSON; ultrapassá-los sinaliza revisão, não um gate universal de CI. Existem alertas de tempo/alocação/tamanho no caso de 4h e de alocação/pico nos casos de análise. Não foram escolhidos percentuais arbitrários nem modificados os limites operacionais para aprovar o experimento. Calibrar aceitação em carga representativa/ambiente alvo permanece pendente; não se trata os números como orçamento de produção.

## Reprodução e evidência

Ferramenta versionada: [architecture-benchmark.cjs](../../tools/architecture-benchmark.cjs). Na raiz, com uma pasta nova (não existente):

~~~powershell
node tools/architecture-benchmark.cjs . C:\Temp\escalalivre-benchmark-novo 66659daa2bbfc2384605946ec5b553e0bcd51eed
~~~

O script só cria cópias/arquivos na pasta indicada, não apaga arquivos e não muda fontes do checkout. SDK/dependências precisam estar disponíveis; a execução reconstrói os projetos, e as fontes finais precisam continuar compatíveis com os pontos de instrumentação verificados pelo script.

[Resultados completos, ambiente e manifesto](evidence/stage-6/performance-results.json), [saída da execução](evidence/stage-6/performance-run.txt), [build original](evidence/stage-6/performance-baseline-build.txt), [build final](evidence/stage-6/performance-final-build.txt).

Não existem amostras históricas controladas de desempenho/CPU/memória em 23/10. O que foi medido é uma reprodução retrospectiva comparável hoje; cinco amostras por versão e caso pequeno não provam comportamento sob carga máxima, estabilidade estatística, latência HTTP ou capacidade em Linux. Essas limitações ficam em aberto em vez de afirmar ganhos.
