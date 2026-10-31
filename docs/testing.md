# Validação e fronteiras de teste

Os projetos têm dependências e objetivos distintos; helpers de teste retornam capacidades reais, sem uma fachada combinando análise/validação/geração.

| Grupo | Projeto/comando | Fronteira verificada |
| --- | --- | --- |
| Puro | EscalaLivre.Analysis.Tests (239 casos) | Apenas Application/Domain: valores/agregados, políticas, regimes, hashes completos, comandos e admissão. Deployment sem Infrastructure/API/OR-Tools. |
| Adaptador | EscalaLivre.Adapter.Tests (379 casos) | Infrastructure/Application/Domain: OR-Tools real, limites/modelos, documentos atuais/legados, importação/exportação/PDF e recuperação. Sem referência ao projeto API. |
| API | EscalaLivre.Api.Tests (33 casos) | Composição das capacidades/famílias, fila/retenção/orçamentos, amostragem de memória e opções de proteção; sem servidor HTTP nesses testes unitários. |
| Arquitetura | EscalaLivre.Architecture.Tests (13 casos) | Grafo de referências, imports e superfície pública; scanner verificado também com formas proibidas, sem executar solver. |
| Frontend | frontend/tests/*.test.cjs (487 casos) | Paridade, contratos, recuperação, coleções inválidas/excessivas, store, construção/edição, arquiteturas das políticas e independência do fuso. |
| HTTP/worker | backend/security.integration.cjs (22 casos) | API e processos filhos reais, envelope/status, frontend/analyze/validate/solve, fila, cancelamento, tempo/memória, recuperação e cotas por endpoint/IP/operação. |

Os testes de retenção da fila usam `TimeProvider` controlável, inclusive para o
timer de limpeza: não aguardam dois minutos reais. Verificam retenção, orçamento,
metadados, FIFO/paralelismo e concorrência entre consulta e finalização/limpeza.

A revisão de publicação inclui uma execução da matriz com Node 22 no Windows e
fluxos reais no Edge headless, além das suítes acima. Comandos, evidências e
limites de ambiente estão no [parecer final](../review/PARECER-PUBLICACAO.md).
Linux/CI remota e futura hospedagem permanecem condições separadas de aprovação.

Na raiz, em Release:

~~~powershell
dotnet test backend/EscalaLivre.Analysis.Tests/EscalaLivre.Analysis.Tests.csproj -c Release
dotnet test backend/EscalaLivre.Adapter.Tests/EscalaLivre.Adapter.Tests.csproj -c Release
dotnet test backend/EscalaLivre.Api.Tests/EscalaLivre.Api.Tests.csproj -c Release
dotnet test backend/EscalaLivre.Architecture.Tests/EscalaLivre.Architecture.Tests.csproj -c Release
node --test frontend/tests/*.test.cjs
npm --prefix frontend run lint
npm --prefix frontend run build
dotnet build backend/EscalaLivre.Api/EscalaLivre.Api.csproj -c Release
$env:SECURITY_BUILD_CONFIGURATION='Release'
node backend/security.integration.cjs
~~~

Execute também o frontend com outro fuso, restaurando TZ:

~~~powershell
$oldTz=$env:TZ
try { $env:TZ='America/New_York'; node --test frontend/tests/*.test.cjs }
finally { $env:TZ=$oldTz }
~~~

Para integração HTTP e medições locais, evite carga concorrente de build/testes. As sondas de fila/deadline mantêm 1s e confirmam a liberação do slot com análise simples; a fila ainda admite/rejeita trabalhos solve reais. Geração e recuperação de solve são verificadas nos demais testes com o orçamento normal. Isso não certifica inicialização nativa em menos de 1s, nem altera limites de produção.

global.json permite latestFeature: 10.0.402 foi uma seleção válida para 10.0.201 solicitado. Nenhuma execução exata sem roll-forward é alegada. CI usa Ubuntu 24.04, Node 22 e SDK 10.0.x permitido pela configuração. Na [revalidação atual](decisions/stage-6-current-validation.md), Validate #20 foi conferida: seis jobs verdes para o merge de teste de d40f887, sem diferença de arquivos para o checkout; SDK remoto 10.0.403 e Node 22.23.3. Os comandos locais usaram Windows/Node 24 e dependências já instaladas do lockfile; não equivalem a npm ci/Linux.

Os 581 casos .NET anteriores foram preservados: 197 puros + 384 mistos passaram antes; 207 puros + 366 adaptador + 8 API passaram após migração e antes da remoção. A arquitetura acrescenta 13, totalizando 594 casos .NET. Contagens são evidências desta entrega, não uma meta artificial de cobertura.

Recompilação atual: `dotnet build EscalaLivre.slnx -c Release -t:Rebuild` passou antes de executar as suítes; os comandos `dotnet test` também compilaram os respectivos projetos. Integração usou Release após build atual da API, sem carga concorrente de build/testes. Resultado: 594 .NET, 373 frontend em cada fuso e 16 HTTP aprovados, sem falhas/ignorados; lint e builds passaram. Logs/comandos e limites de conclusão estão na [revalidação](decisions/stage-6-current-validation.md).

Relatório de aceite/limitações: [revisão final](decisions/stage-6-final-review.md). Medição separada/reproduzível: [desempenho](decisions/stage-6-performance.md).

## Seguimento das fronteiras operacionais

A entrega posterior acrescenta 8 casos puros e 10 de adaptador, totalizando 612 .NET. Reproduções anteriores à correção, validação incremental, comandos completos e logs estão no [ADR 009](decisions/009-validated-operational-boundaries.md). Compara-se o conteúdo completo dos turnos preservados, inclusive IDs, pausas, source e tags; a geração aceita não promete identidade das referências/contêineres fornecidos pelo adaptador. As novas regressões exigem isolamento contra mutação após o agregado. Falhas de geração continuam devolvendo as atribuições originais. A CI antiga de d40f887 não valida o diff desta entrega.

## Extensibilidade dos regimes — 27/10/2026

O [ADR 010](decisions/010-regime-extension-boundaries.md) acrescenta 11 casos puros e 8 frontend. Total atual: 623 .NET (226/376/8/13), 381 frontend em cada fuso e 16 HTTP. A estratégia adicional existe apenas em Analysis.Tests: comprova resolução e elegibilidade/capacidades genéricas, sem alegar extensão completa da cadeia do produto por registro. Os cenários compartilhados não foram alterados. HTTP rejeita tipos desconhecidos e a estratégia de teste nos três endpoints de cálculo, em empresa e pessoa. Logs/comandos e manifesto de fontes estão no ADR. CI #22 valida o baseline b8e88e3; este diff ainda exige CI própria.

## Paridade diferencial — 27/10/2026

Execute também node tools/parity-differential.cjs na raiz e com TZ=America/New_York. O comando recompila o probe puro atual; não aceite resultados de um DLL antigo como compilação validada. As sementes, campos comparados, limites, replay de failure.json e protocolo de redução/decisão estão em [rule-parity](rule-parity.md#verificação-diferencial-determinística--27102026). A CI tem um job obrigatório próprio nos fusos UTC/NY; as suítes frontend e HTTP consomem os mesmos novos documentos. Resultado e diferenças de ambiente: [relatório](decisions/011-deterministic-rule-parity.md).

## Desempenho atual

O [relatório de desempenho atual](decisions/012-current-performance.md) descreve entradas sintéticas, snapshots isolados, aquecimento, repetições, fases, memória, modelos, HTTP/fila/worker e alertas. Use tools/performance-benchmark.cjs, tools/performance-http.cjs e tools/performance-alerts.cjs conforme os comandos documentados. O workflow manual Performance evidence coleta dados sem impor os limites locais Windows à CI Ubuntu. Não execute builds/testes concorrentes às amostras. A instrumentação é copiada para diretórios isolados; os projetos de produção não recebem sondas de benchmark.
