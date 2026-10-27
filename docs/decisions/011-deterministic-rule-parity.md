# Paridade diferencial e autorização direcional — 27/10/2026

O comparador atual encontrou D2: nomes antigos de cobertura podiam restabelecer uma autorização revogada no C#. O caso foi reduzido a uma pessoa, um turno, uma exigência e um segundo; entrada/saídas e decisão foram registradas em [rule-parity](../rule-parity.md#decisão-d2--autoridade-da-autorização-direcional-27102026) antes da correção. A [evidência anterior](evidence/parity/before-fix-revocation.json) mantém score C# 1 versus TS 0. O mesmo replay agora passa com score 0 nos dois lados. IDs explícitos têm autoridade; nomes são fallback somente quando a lista de IDs está ausente. TS passou a reconhecer esse legado também em análise direta, sem exigir uma migração prévia. O mapeamento de arquivo/JSON permanece compatível.

ScheduleRules.CanCover é consumido por elegibilidade/exceções, candidatos, alocação de leitura e CoverageConstraints. Corrigi-lo protege também o gerador. Três regressões com OR-Tools real cobrem legado, autorização somente por ID e revogação com nomes obsoletos, usando entradas/pausas fixas sem depender da escolha exata de um ótimo. Não foram alterados pesos, granularidade, prazos, tamanho de fila, limites de produção, os 58 documentos/hashes anteriores ou os 20 contratos de regime. A [matriz revisada](../rule-parity.md#verificação-diferencial-determinística--27102026) explicita lacunas, propriedades, escopo e limitações.

## Ambiente e identidade da validação

Windows 11 10.0.26100 win-x64, SDK .NET 10.0.402/MSBuild 18.9.15, runtime 10.0.13, Node 24.17.0, npm 11.13.0. Dependências frontend já instaladas a partir do lockfile; não foi alegado npm ci novo nem teste local em Linux/Node 22. Fuso padrão America/Cuiaba, repetição America/New_York. Build/testes/integração rodaram sequencialmente, sem carga de compilação concorrente ao HTTP. Período UTC da matriz: 13:11:44–13:14:51 em 27/10/2026.

Checkout baseado em b8e88e32893336f2626bd0c557ef751c8fcd3b4d, contendo o diff de extensibilidade da entrega anterior e este diff de paridade ainda locais. [Manifesto SHA-256](evidence/parity/final/source-manifest.json) registra 246 arquivos de código, fixtures, projetos e CI antes do rebuild; todos foram reconferidos após as suítes. Documentação/evidências acrescentadas depois não integram esse manifesto. A solução atual foi recompilada integralmente antes dos testes e a API Release foi compilada antes do HTTP. Cada execução diferencial recompilou o probe atual com --no-incremental. Nenhum resultado de binário antigo substitui essa compilação.

## Resultados

| Verificação | Resultado |
| --- | --- |
| Solução, Release -t:Rebuild, incluindo probe | Passou; zero avisos/erros |
| Domínio/aplicação puros | 238 aprovados |
| Adaptador real | 379 aprovados |
| API | 8 aprovados |
| Arquitetura | 13 aprovados |
| Total .NET | 638 aprovados |
| Frontend, Cuiabá / Nova York | 468 / 468 aprovados |
| Diferencial C#/TS, Cuiabá / Nova York | 142 / 142 entradas aprovadas, incluindo propriedades |
| Lint / build frontend / build API atual | Passaram |
| HTTP com processos worker reais | 16 aprovados; comparação existente ampliada com 12 documentos novos |

Os 12 documentos acrescentam 12 casos puros e 87 testes frontend (12 fronteiras + 72 gerados + 3 propriedades gerais); o adaptador acrescenta três regressões. O total cresce a partir da entrega de extensibilidade (623 .NET/381 frontend); não se confundem as contagens com cobertura exaustiva. Nenhuma falha, cancelamento ou teste ignorado na matriz final. O probe .deps.json foi conferido sem Infrastructure/API/OR-Tools.

## Comandos e logs

[results.json](evidence/parity/final/results.json) contém executáveis, argumentos, cwd, fuso explícito quando repetido, horário e exit code de cada comando. Logs separados preservam as saídas completas:

- [rebuild](evidence/parity/final/solution-build.txt), [análise pura](evidence/parity/final/analysis.txt), [adaptador](evidence/parity/final/adapter.txt), [API](evidence/parity/final/api.txt), [arquitetura](evidence/parity/final/architecture.txt);
- [frontend](evidence/parity/final/frontend.txt), [frontend NY](evidence/parity/final/frontend-new-york.txt), [diferencial](evidence/parity/final/differential.txt), [diferencial NY](evidence/parity/final/differential-new-york.txt);
- [lint](evidence/parity/final/lint.txt), [build frontend](evidence/parity/final/frontend-build.txt), [build API](evidence/parity/final/api-build.txt), [HTTP/worker](evidence/parity/final/http-worker.txt).

~~~powershell
dotnet build EscalaLivre.slnx -c Release -t:Rebuild
dotnet test backend/EscalaLivre.Analysis.Tests/EscalaLivre.Analysis.Tests.csproj -c Release
dotnet test backend/EscalaLivre.Adapter.Tests/EscalaLivre.Adapter.Tests.csproj -c Release
dotnet test backend/EscalaLivre.Api.Tests/EscalaLivre.Api.Tests.csproj -c Release
dotnet test backend/EscalaLivre.Architecture.Tests/EscalaLivre.Architecture.Tests.csproj -c Release
node --test frontend/tests/*.test.cjs
node tools/parity-differential.cjs
$oldTz=$env:TZ
try {
  $env:TZ='America/New_York'
  node --test frontend/tests/*.test.cjs
  node tools/parity-differential.cjs
} finally { $env:TZ=$oldTz }
npm --prefix frontend run lint
npm --prefix frontend run build
dotnet build backend/EscalaLivre.Api/EscalaLivre.Api.csproj -c Release
$env:SECURITY_BUILD_CONFIGURATION='Release'
node backend/security.integration.cjs
~~~

## Classificação das falhas e pendências

- **Produto:** D2 reproduzida e corrigida após decisão. Cobertura/score antes/depois têm expectativas independentes. Não se alteraram hashes antigos para obter aprovação.
- **Instrumento/ambiente:** a primeira versão do gerador emitiu descanso da empresa abaixo de 11h, corretamente rejeitado. O gerador foi limitado ao contrato estrutural já vigente. O console Windows inicialmente corrompeu acentos; UTF-8 explícito no probe corrigiu o transporte, sem mudar regras/textos. A propriedade inicial confundiu pausa null com campo ausente, representações já equivalentes no serializador; a comparação passa a normalizar apenas essa ausência, preservando todos os horários e conteúdo restantes. Esses erros ocorreram durante a construção do instrumento e não eram divergências de negócio. A matriz final reexecutou tudo.
- **Intermitência:** nenhuma observada na matriz final; isso não prova ausência global de intermitência. Sementes, IDs e datas fixos, vocabulário finito e limites exclusivos dos testes evitam busca aleatória sem limite. HTTP mantém os limites de produção existentes.
- **CI:** [Validate #22](https://github.com/argemon/escalalivre/actions/runs/40377752675), evento push, head SHA b8e88e32893336f2626bd0c557ef751c8fcd3b4d, completed/success, foi reconferida pela API GitHub; [registro](evidence/parity/final/remote-ci.json). A ferramenta de listagem por commit que filtra somente pull_request devolveu vazio, por isso a consulta final foi ao endpoint Actions sem esse filtro. Essa CI valida o baseline, não o diff local. O novo job diferencial está configurado em UTC/NY, participa do gate backend e publica failure.json em falha. A execução remota do diff permanece pendente até publicação autorizada; não houve commit/push, disparo nem reexecução remota nesta entrega.
- **Escopo:** paridade de diagnóstico/cobertura não prova equivalência da função objetivo nem de todos os ótimos. Preferências, busca e falhas do gerador permanecem em testes próprios. Redução futura é manual e deve preservar validade estrutural e o mesmo desacordo; o replay usa a entrada gravada, sem depender do gerador atual.
