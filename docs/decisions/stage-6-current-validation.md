# Revalidação atual dos fontes — etapa 6

Data: 26/10/2026, America/Cuiaba (UTC−04). Checkout inicial e ao fim das verificações limpo em `d40f8871238398bcab91bd081742986c244f4548`; árvore Git `95c58edd9e7eeebfc25a4261e12be9ebb35dbc8e`. Nenhuma alteração em código, testes, fixtures, hashes, lockfiles ou limites foi necessária. As alterações desta entrega são somente documentação/evidências. Não houve commit, push, publicação, integração ou disparo de CI.

## Ambiente e proveniência

- Windows 10.0.26100/win-x64, PowerShell; SDK selecionado 10.0.402, MSBuild 18.9.15, runtime .NET/ASP.NET 10.0.13; Node 24.17.0/npm 11.13.0. [Ambiente completo](evidence/stage-6-revalidation/environment.txt).
- `global.json` pede 10.0.201 com `latestFeature`: 10.0.402 é seleção permitida. SDK exato 10.0.201 sem roll-forward não foi executado. Não houve instalação de ferramentas ou reinstalação local via npm ci. Dependências já instaladas, com inventário `npm --prefix frontend ls --depth=0` sem erro: [inventário](evidence/stage-6-revalidation/frontend-dependencies.txt).
- TZ originalmente ausente. Primeira suíte frontend herdou o ambiente padrão do dispositivo (America/Cuiaba); a segunda recebeu `TZ=America/New_York` somente no processo filho. TZ do processo pai permaneceu ausente, sem alteração persistente.
- Antes das suítes, `dotnet build EscalaLivre.slnx -c Release -t:Rebuild` recompilou os oito projetos com zero avisos/erros ([transcrição da saída](evidence/stage-6-revalidation/solution-rebuild.txt)). Os testes .NET seguintes também compilaram seus projetos, sem `--no-build`. Build Release atual da API precedeu HTTP. Resultados de binários antigos não foram usados como evidência de compilação.
- Suítes executadas sequencialmente; HTTP sem builds/testes concorrentes. Testes começaram às 13:58:06 e HTTP terminou às 14:00:41 locais (17:58:06–18:00:41 UTC), após a recompilação. [Comandos, horários UTC e exit codes](evidence/stage-6-revalidation/results.json).

## Comandos e resultados

Na raiz do repositório; todos os comandos abaixo retornaram exit 0. Nenhum caso falhou, foi cancelado ou ignorado.

| Verificação / comando | Resultado | Log |
| --- | --- | --- |
| `dotnet build EscalaLivre.slnx -c Release -t:Rebuild` | 0 avisos/erros | [solução](evidence/stage-6-revalidation/solution-rebuild.txt) |
| `dotnet test backend/EscalaLivre.Analysis.Tests/EscalaLivre.Analysis.Tests.csproj -c Release` | 207/207 | [domínio/aplicação](evidence/stage-6-revalidation/analysis.txt) |
| `dotnet test backend/EscalaLivre.Adapter.Tests/EscalaLivre.Adapter.Tests.csproj -c Release` | 366/366 | [adaptador real](evidence/stage-6-revalidation/adapter.txt) |
| `dotnet test backend/EscalaLivre.Api.Tests/EscalaLivre.Api.Tests.csproj -c Release` | 8/8 | [API](evidence/stage-6-revalidation/api.txt) |
| `dotnet test backend/EscalaLivre.Architecture.Tests/EscalaLivre.Architecture.Tests.csproj -c Release` | 13/13 | [arquitetura](evidence/stage-6-revalidation/architecture.txt) |
| `node --test frontend/tests/*.test.cjs` | 373/373 | [frontend](evidence/stage-6-revalidation/frontend.txt) |
| Mesmo comando com `TZ=America/New_York` | 373/373 | [fuso alternativo](evidence/stage-6-revalidation/frontend-new-york.txt) |
| `npm --prefix frontend run lint` | aprovado | [lint](evidence/stage-6-revalidation/lint.txt) |
| `npm --prefix frontend run build` | tsc/Vite aprovados | [frontend build](evidence/stage-6-revalidation/frontend-build.txt) |
| `dotnet build backend/EscalaLivre.Api/EscalaLivre.Api.csproj -c Release` | 0 avisos/erros | [API build](evidence/stage-6-revalidation/api-build.txt) |
| `node backend/security.integration.cjs`, com `SECURITY_BUILD_CONFIGURATION=Release` | 16/16 | [HTTP/worker real](evidence/stage-6-revalidation/http-worker.txt) |

Total .NET: 594. HTTP executou API/processos filhos reais, sem mock: tickets privados/polling/cancelamento, solve/exportação, proteção HTTP, fila, deadline incluindo análise, desconexão, watchdog de memória, corpo incompleto, tempo civil/round-trip, paridade de documentos, edição e cobertura de histórico sobreposto. Não se ampliaram os prazos de 1s das sondas nem limites de produção. A paridade compartilhada consumiu aproximadamente 60s; a suíte HTTP completa, 94,8s. São durações desta execução, sem inferência de regressão de desempenho.

## Classificação de falhas

| Categoria | Evidência atual | Encaminhamento |
| --- | --- | --- |
| Falha do produto | Nenhuma observada na matriz completa, na primeira execução | Sem correção de código ou novo teste de regressão artificial; regressões existentes foram executadas |
| Problema de ambiente | Nenhum bloqueio de build, restauração, testes ou HTTP. SDK local difere da versão mínima pedida, dentro do roll-forward permitido | Registrar versões e não afirmar execução exata 10.0.201 ou npm ci local |
| Teste intermitente | Nenhum reproduzido nesta rodada. A sensibilidade histórica das sondas solve/1s continua descrita nos relatos anteriores | Passar uma rodada não prova ausência universal de intermitência; não houve repetição para ocultar falhas nem alteração de teste/limite |

As permissões do sandbox exigiram execução autorizada fora da área gravável para build/testes e para atualizar este repositório. Isso é uma restrição da ferramenta, não falha do produto. Não houve execução de suíte malsucedida seguida de aproveitamento de binário antigo.

## CI remota para o código validado

Consulta de leitura pelo conector GitHub em 26/10/2026: [Validate #20](https://github.com/argemon/escalalivre/actions/runs/40355002311), run ID 40355002311, concluída com `success`, associada ao head `d40f8871238398bcab91bd081742986c244f4548`. [Resposta da consulta por commit](evidence/stage-6-revalidation/ci-run.json) e [jobs/steps](evidence/stage-6-revalidation/ci-jobs.json).

O workflow de pull request fez checkout do merge de teste `0f32fa55706797101ae787d2d5a24f3cd961dccd`, incorporando esse head em `66659daa2bbfc2384605946ec5b553e0bcd51eed`. Não se apresenta o SHA do merge como o próprio commit local: a comparação GitHub de d40f887 → 0f32fa5 retornou `files: []`, `ahead_by: 1`, `behind_by: 0` ([comparação](evidence/stage-6-revalidation/ci-compare.json)). Portanto o conteúdo de arquivos validado remotamente é o mesmo; o commit de merge tem identidade distinta.

| Job | Resultado e evidência |
| --- | --- |
| domain-analysis | success, 207/207 — [trecho de log](evidence/stage-6-revalidation/ci-domain-analysis-excerpt.txt) |
| adapter | success, 366/366 — [trecho de log](evidence/stage-6-revalidation/ci-adapter-excerpt.txt) |
| architecture-api | success, 8/8 e 13/13 — [trecho de log](evidence/stage-6-revalidation/ci-architecture-api-excerpt.txt) |
| frontend | success, npm ci/lint/build e 373/373 em ambos os fusos — [trecho de log](evidence/stage-6-revalidation/ci-frontend-excerpt.txt) |
| http-worker | success, build atual e 16/16 HTTP — [trecho de log](evidence/stage-6-revalidation/ci-http-worker-excerpt.txt) |
| backend | success, gate dos quatro jobs backend — [steps](evidence/stage-6-revalidation/ci-jobs.json) |

Logs remotos: Ubuntu 24.04.5, SDK 10.0.403/runtime 10.0.14 e Node 22.23.3/npm 10.9.9; instalação por lockfile via npm ci aprovada. Nenhuma execução foi solicitada ou repetida nesta sessão. A consulta por commit do conector cobre a primeira página de runs de pull request; basta para comprovar esta execução identificada, sem afirmar inventário exaustivo de todos os eventos.

## Pendências e alcance

- CI antes pendente: conferida para o conteúdo do commit atual. Atualizações documentais desta revalidação são locais e posteriores à execução consultada.
- Calibração de desempenho em carga representativa/ambiente alvo permanece pendente. Nenhuma nova medição foi realizada; o [experimento original](stage-6-performance.md) e seus alertas não foram reinterpretados como gates aprovados. O plano continua sem aceite integral por esse critério.
- SDK exato 10.0.201 sem roll-forward não executado; ambiente local usou dependências existentes, enquanto a CI comprovou npm ci/Linux/Node 22. Não foram enfraquecidos testes nem ampliados limites para aprovação.
- Os relatos/logs anteriores são históricos e foram preservados. O sucesso atual não apaga falhas intermediárias ou intermitências documentadas, nem constitui prova universal de regras ou desempenho.
