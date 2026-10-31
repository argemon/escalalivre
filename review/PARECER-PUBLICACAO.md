# Parecer final das correções de publicação

Data: 31/10/2026. Repositório: argemon/escalalivre.

**Parecer: aprovação condicionada.** As correções funcionais foram confirmadas
no ambiente local e nenhum novo defeito bloqueador de código foi reproduzido na
revisão. A aprovação operacional para publicação permanece pendente das condições
abaixo. Não houve publicação, push/merge ou alteração de configuração de produção.

`review/PARECER-PUBLICACAO.md` e `review/PLANO-CORRECAO.md` não existiam no início
da revisão. Este parecer foi criado para registrar o resultado; não foi inventado
um plano ausente. Foram lidos AGENTS.md, arquitetura/plano de evolução, paridade,
documentação da fila/recuperação e os relatórios das três entregas.

## Escopo e identificação do código

Revisado o diff de trabalho contra
`600d1d1c752e69dd2e91ca75bb3342ad1ad17f01`, incluindo os arquivos novos não
rastreados das entregas 1–3. Isso não representa um commit/PR já integrado.
O [manifesto de fontes](../docs/decisions/evidence/publication-review/source-manifest.json)
registra SHA-256 de 252 arquivos de backend/frontend/shared e instrumentos de
paridade. Os fontes do produto não foram modificados nesta revisão.

Foram examinados seleção de políticas/ordem dos middlewares, proxy confiável,
fila/contabilização/finalização/limpeza, serialização limitada, ciclo de vida do
worker, opções e sua validação, manifesto/lockfile npm, schema/barreira estrutural,
testes e documentação. O código de CalculationWorker não mudou nas correções.
O encerramento e espera do processo continuam anteriores à liberação do lease.

## Achados e condições por severidade

As lacunas de ambiente abaixo são condições de aprovação, e não defeitos de
código comprovados. Não foram encontrados novos achados P0 no escopo examinado.

| Prioridade | Achado/limite | Evidência e condição restante |
| --- | --- | --- |
| P1 operacional | Hospedagem e capacidade real ainda não validadas | O responsável confirmou que o projeto nunca foi publicado. Não há ambiente de homologação, URL, certificado ou infraestrutura para inspecionar. Antes da aprovação operacional, verificar TLS/HTTPS/HSTS, proxy/IP real, origens CORS, acesso à origem, criação/encerramento de filhos, orçamento global de CPU/RAM, reinício e carga em ambiente isolado. |
| P2 | Linux/CI remota do diff não executada | WSL não está instalado e Docker não está disponível. A matriz passou em Windows/Node 22/.NET 10. É necessário executar o workflow completo em Ubuntu 24.04/Node 22/.NET 10 sobre os mesmos fontes antes da integração. Nenhuma CI antiga foi usada como prova deste diff. |
| P2 | Avisos de dependências de desenvolvimento continuam abertos | A auditoria final aponta 11 pacotes moderados na cadeia de minimatch/ESLint/typescript-eslint. O caminho de produção foi mitigado por exclusão dessa cadeia: auditoria `--omit=dev` sem avisos e dependências classificadas como desenvolvimento no lockfile. Isso não corrige a ferramenta de desenvolvimento; atualizar/avaliar separadamente ou registrar aceite explícito do risco de CI/lint. Não tratar padrões/configurações de lint de origem não confiável como dados inofensivos. |
| P2 operacional | Payload limitado não certifica RSS/heap ou capacidade da hospedagem | Reservas de 4 MiB, orçamento de 128 MiB e teto de 1.024 tickets são verificados. Objetos, buffers, respostas em andamento e filhos têm custos adicionais. Não foi medida carga representativa nem pico total de RAM no host final. Limites do host/container e dimensionamento continuam necessários. |
| P3 | Dois avisos de anotação PURE do Zod durante o build | Rollup informa remoção de comentários que não consegue interpretar. Build e execução do bundle no navegador passaram. Não foi trocado o bundler nem silenciado o aviso. Acompanhar atualização compatível da ferramenta/biblioteca. |

O aviso do Zod em produção foi resolvido por 4.6.7. O
[GHSA oficial](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) informa correção
a partir de 4.6.6. Para o risco residual de desenvolvimento, o
[aviso de minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249) informa
correção em 11.0.1. A auditoria final não oferece correção automática para
minimatch; oferece `fixAvailable=true` para um pacote derivado,
@typescript-eslint/type-utils. Isso não demonstra resolução da cadeia completa.
Nenhum `audit fix --force` ou override de versão principal foi aplicado.

## Resultado dos seis critérios

| Critério | Resultado local e evidência | Limite da conclusão |
| --- | --- | --- |
| 1. Variações de rota não contornam geração | Confirmado. POST `/solve` e `/solve/jobs` recebem metadados da mesma categoria; casos de caixa e barra final compartilham a cota. HTTP verifica ambas como primeira rota, pedidos inválidos, 429, CORS e Retry-After. | Reescritas de caminho feitas por um futuro proxy ainda precisam ser verificadas na hospedagem. |
| 2. Um IP não esgota consultas de outro | Confirmado. Partições por operação/IP; após 429 para um IP, outro continua recebendo 404 normal para ticket inexistente. Proxy explicitamente confiável permite distinguir IPs; cabeçalhos forjados sem confiança não rotacionam cotas. | Endereços confiáveis reais e encaminhamento de um salto dependem da implantação. Usuários no mesmo NAT continuam compartilhando IP. |
| 3. Consulta não consome reserva de cancelamento | Confirmado nos dois sentidos. GET e DELETE têm categorias/orçamentos próprios; esgotar GET não impede DELETE, e o inverso também foi testado. Independentes da cota geral. | A concorrência global continua comum: saturá-la pode impedir temporariamente até um cancelamento. |
| 4. Histórico não bloqueia indevidamente a fila | Confirmado. Teste unitário conclui 40 pedidos pequenos e conserva todos os resultados. Adicionalmente, 40 pedidos reais sequenciais completaram por HTTP/worker e os 40 resultados continuaram consultáveis. | Orçamento real de payload ou metadados cheio ainda deve recusar admissão; não há promessa de admissão ilimitada. |
| 5. Memória, retenção e paralelismo limitados | Confirmado para os limites lógicos/instrumentados. Testados reserva/teto de payload, limite exato de 4 MiB + um byte, metadados cheios, expiração aos 120s, limpeza periódica, falha/cancelamento, concorrência com consultas e FIFO/dois executores. HTTP verifica watchdog de memória, deadlines, concorrência global e recuperação. | Não equivale a limite rígido da memória do processo/host nem comprovação de capacidade em Linux/produção. |
| 6. Dependências corrigidas ou mitigadas | Zod atualizado, pré-validação estrutural antes de migração, diagnósticos por coleção interrompidos na primeira falha. npm produção: zero avisos; NuGet com transitivos: zero avisos. | Os 11 avisos moderados de desenvolvimento permanecem abertos; mitigação demonstrada para o caminho público de produção, sem alegar correção do ferramental. |

## Matriz completa de CI executada

Execução sequencial por [tools/review-ci.ps1](../tools/review-ci.ps1), com Node 22
isolado, `npm ci` do lockfile e restauração/testes .NET. Nenhuma etapa falhou.
Logs completos e comandos estão em
[matrix.json](../docs/decisions/evidence/publication-review/matrix.json).

| Etapa | Resultado |
| --- | --- |
| `npm ci --prefix frontend --include=dev` | Aprovado; Zod 4.6.7 instalado pelo lockfile |
| Lint | Aprovado |
| TypeScript + Vite build de produção | Aprovado; dois avisos de comentário descritos acima |
| Frontend em UTC | 487/487 |
| Frontend em America/New_York | 487/487 |
| EscalaLivre.Analysis.Tests, Release | 239/239 |
| EscalaLivre.Adapter.Tests, Release, OR-Tools real | 379/379 |
| EscalaLivre.Api.Tests, Release | 33/33 |
| EscalaLivre.Architecture.Tests, Release | 13/13 |
| Diferencial puro C#/TypeScript em UTC | 142/142 |
| Diferencial puro C#/TypeScript em America/New_York | 142/142 |
| Build da API, Release | Aprovado |
| Integração HTTP/worker, Release, UTC | 22/22 |

Total .NET: 664 aprovados. As quatro suítes foram executadas separadamente,
conforme o workflow. O teste HTTP usa processos filhos reais e confere, entre
outros pontos, importação/exportação, memória, timeout, cancelamento e paridade.

Ambiente desta execução: Windows NT 10.0.26200, Node **22.23.4**, SDK .NET
**10.0.401** com roll-forward permitido por global.json, runtime **10.0.12**.
O host inicialmente tinha Node 24.14.1; a matriz final usou Node 22, conforme
registrado pelos próprios comparadores de paridade. CI prevista: Ubuntu 24.04,
Node 22 e .NET 10. Não foi executado Linux local nem workflow remoto.

O npm local é 11.11.0, instalado junto do Node 24. Seu wrapper PowerShell ignora
o Node priorizado no PATH e usa o executável vizinho. Isso foi detectado na
revisão do instrumento: a primeira instalação usou Node 24, embora os checks
subsequentes já usassem Node 22 explicitamente. O runner foi corrigido para
chamar `node22 npm-cli.js`, e a matriz completa foi repetida. O registro anterior
fica em matrix-first-run.json, com essa diferença identificada. A versão npm
fornecida pelo futuro setup-node remoto não foi presumida idêntica à local.

Auditorias finais: [npm completo](../docs/decisions/evidence/publication-review/npm-audit.json),
[npm produção](../docs/decisions/evidence/publication-review/npm-production.json) e
[NuGet com transitivos](../docs/decisions/evidence/publication-review/nuget-audit.json).
O exit code 1 da auditoria npm completa é esperado pelos avisos abertos; não foi
confundido com auditoria sem vulnerabilidades. Produção e NuGet retornaram 0.

## Navegador e impressão

Usados **Edge 156.0.4314.50 headless**, Playwright 1.64.1, Node 22.23.4,
viewport 1440×1000, locale pt-BR e fuso America/Cuiaba. Testado o build de produção
servido localmente, com proxy HTTP local para uma instância nova da API e seus
workers reais. Foram usados somente dados fictícios e contextos de armazenamento
isolados. Não foram chamados stores diretamente para acionar os fluxos: cliques,
upload, download e edição ocorreram pela interface; localStorage foi lido para
verificar os resultados.

| Fluxo | Verificação |
| --- | --- |
| Geração | Clique → POST 202 → polling real → resultado ótimo/viável e turnos presentes em dia aberto |
| Cancelamento | Ocupação controlada do worker local → geração pela UI → DELETE real → estado final cancelado e turnos anteriores preservados |
| Edição durante espera | Empresa editada/salva enquanto a UI aguardava; resposta antiga não sobrescreveu os turnos; mensagem de nova geração exibida |
| Importação/exportação | Download nativo, upload com confirmação/substituição, checkpoint anterior e rejeição de coleção inválida com documento atual preservado |
| Recuperação | Primário inválido preservado byte a byte, cópia válida carregada, download do original inválido e restauração manual pela UI |
| Impressão | Diálogo da aplicação, tabela de dados, clique no comando real `window.print`, evento beforeprint e CSS de impressão |
| Estado local volumoso | Documento válido acima de 1 MiB reaberto/recarregado no navegador com 110 turnos, sem aplicar indevidamente o limite dos arquivos |

Resultado final: **7/7 fluxos aprovados**, sem exceções JavaScript não tratadas.
[browser.json](../docs/decisions/evidence/publication-review/browser.json) registra
os resultados; as imagens têm o nome do caso no mesmo diretório.

O motor de impressão gerou também
[um PDF A4 horizontal](../docs/decisions/evidence/publication-review/print-engine.pdf).
Foi reaberto com pypdf e renderizado com Poppler, com inspeção visual da
[página renderizada](../docs/decisions/evidence/publication-review/browser-print-pdf.png):
uma página, dados/horários/intervalo e marca legíveis, sem corte observado na
saída PDF. Dimensões: aproximadamente 842,88 × 595,92 pontos. Não foi testada
impressora física, diálogo nativo do sistema, Firefox/Safari nem paginação de
uma equipe grande. A captura de mídia print no viewport não foi confundida com
o PDF paginado.

As primeiras tentativas do harness tinham asserções incompatíveis com a fixture
de validação usada: ela continha um feriado fechado, e o cancelamento pode
responder processing até o runner retornar. Corrigidos somente fixture/asserts
do instrumento e repetida a execução completa. As tentativas intermediárias
ficam em browser-first-attempt.json/browser-second-attempt.json; não são defeitos
do aplicativo ocultados nem mudanças na regra de escala.

O [ensaio local de histórico](../docs/decisions/evidence/publication-review/local-history.json)
registrou 40 conclusões reais, 40 resultados consultáveis, um submit por vez e
um worker. A execução final levou aproximadamente 30,7 segundos. Isso não é
benchmark de capacidade: as cotas de geração/solicitações foram elevadas somente
no processo local de revisão para permitir o ensaio. Concorrência, watchdog,
payload e retenção permaneceram limitados. As cotas de tráfego são verificadas
separadamente nos testes HTTP com limites baixos e IPs distintos.

Para reproduzir os instrumentos no Windows, sem alterar o manifesto do produto:

```powershell
npm install --prefix artifacts/review-runtime --no-save --package-lock=false playwright@1.64.1 node@22.23.4
./tools/review-ci.ps1 -NodeBinary ./artifacts/review-runtime/node_modules/node/bin/node.exe
./artifacts/review-runtime/node_modules/node/bin/node.exe tools/review-browser.cjs
```

O último comando espera Edge no caminho padrão; `REVIEW_BROWSER_PATH` permite
selecionar outro executável Chromium compatível já instalado. Ele inicia/encerra
seus próprios serviços em portas locais temporárias e não aceita uma URL remota
como alvo de carga. As dependências do instrumento ficam fora do package.json
do aplicativo. A captura PDF adicional usou REVIEW_BROWSER_CASES=browser-print,
REVIEW_BROWSER_REPORT=browser-print-engine.json e REVIEW_PRINT_PDF apontando para
um arquivo temporário; o PDF foi preservado como evidência após a inspeção.

## Condições para aprovação de publicação

1. Executar a CI completa em Ubuntu/Node 22/.NET 10 sobre o mesmo conteúdo
   revisado, sem usar um baseline anterior como evidência.
2. Preparar homologação isolada para conferir HTTPS/certificado/HSTS,
   proxy confiável/IP real, origens CORS/Retry-After e fechamento do acesso direto
   à origem quando aplicável. Não executar carga em usuários reais.
3. Verificar criação/encerramento de processos, limites e pico de RAM/CPU do
   conjunto API + filhos, disponibilidade sob carga representativa, esgotamento
   de fila/payload e recuperação após cancelamento/reinício no host escolhido.
4. Resolver a cadeia de desenvolvimento afetada ou registrar aceite explícito
   e delimitado desse risco, preservando a exclusão dela do artefato/runtime de
   produção. Não declarar todos os avisos npm resolvidos.

Nada dependente dessa infraestrutura foi marcado como verificado. Esta revisão
acrescenta parecer, instrumentos e evidências; não autoriza nem realiza implantação.
