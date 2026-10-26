# Validação e fronteiras de teste

Os projetos têm dependências e objetivos distintos; helpers de teste retornam capacidades reais, sem uma fachada combinando análise/validação/geração.

| Grupo | Projeto/comando | Fronteira verificada |
| --- | --- | --- |
| Puro | EscalaLivre.Analysis.Tests (207 casos) | Apenas Application/Domain: valores/agregados, políticas, regimes, hashes completos, comandos e admissão. Deployment sem Infrastructure/API/OR-Tools. |
| Adaptador | EscalaLivre.Adapter.Tests (366 casos) | Infrastructure/Application/Domain: OR-Tools real, limites/modelos, documentos atuais/legados, importação/exportação/PDF e recuperação. Sem referência ao projeto API. |
| API | EscalaLivre.Api.Tests (8 casos) | Composição das capacidades/famílias, fila e amostragem de memória; sem servidor HTTP nesses testes unitários. |
| Arquitetura | EscalaLivre.Architecture.Tests (13 casos) | Grafo de referências, imports e superfície pública; scanner verificado também com formas proibidas, sem executar solver. |
| Frontend | frontend/tests/*.test.cjs (373 casos) | Paridade, contratos, recuperação, store, construção/edição, arquiteturas das políticas e independência do fuso. |
| HTTP/worker | backend/security.integration.cjs (16 casos) | API e processos filhos reais, envelope/status, frontend/analyze/validate/solve, fila, cancelamento, tempo/memória e recuperação. |

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

global.json permite latestFeature: 10.0.402 foi uma seleção válida para 10.0.201 solicitado. Nenhuma execução exata sem roll-forward é alegada. CI usa Ubuntu 24.04, Node 22 e SDK 10.0.x permitido pela configuração; o resultado remoto deste checkout ainda precisa ser obtido antes da integração. Os comandos locais usaram Windows/Node 24 e dependências já instaladas do lockfile; não equivalem a npm ci/Linux.

Os 581 casos .NET anteriores foram preservados: 197 puros + 384 mistos passaram antes; 207 puros + 366 adaptador + 8 API passaram após migração e antes da remoção. A arquitetura acrescenta 13, totalizando 594 casos .NET. Contagens são evidências desta entrega, não uma meta artificial de cobertura.

Relatório de aceite/limitações: [revisão final](decisions/stage-6-final-review.md). Medição separada/reproduzível: [desempenho](decisions/stage-6-performance.md).
