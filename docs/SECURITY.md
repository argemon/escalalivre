# Proteção da API pública

As proteções são habilitadas por padrão. Não substituem proteção contra DDoS na
infraestrutura, nem representam uma garantia de disponibilidade.

## Limites iniciais

| Controle | Padrão |
| --- | --- |
| Solicitações gerais por IP | 60 por minuto; consultas e cancelamentos de tickets usam cotas próprias |
| Gerações por IP | 6 por minuto, compartilhadas entre POST `/solve` e POST `/solve/jobs`, incluindo caixa e barra final |
| Consultas de tickets por IP | 1.200 por minuto (`JobPollsPerMinute`) |
| Cancelamentos de tickets por IP | 60 por minuto (`JobCancellationsPerMinute`), independentes das consultas |
| Requisições em execução na API | 8, sem fila adicional |
| Processos de cálculo simultâneos | 1 |
| Pedidos aguardando cálculo | 2 |
| Tickets de geração em memória, incluindo ativos e finalizados | 1.024 (`JobRetentionLimit`) |
| Payload UTF-8 de entrada/resultado da fila | 4 MiB por pedido; reserva de 4 MiB enquanto ativo |
| Orçamento de reservas ativas + payload de resultados retidos | 128 MiB (`JobPayloadBudgetMb`), não é limite de memória real do processo |
| Retenção de resultado e estado final | Dois minutos desde a finalização, sem remoção antecipada por pressão de admissão |
| Espera máxima na fila | 3 segundos |
| Prazo por processo, incluindo preparação, cálculo e resultado | 12 segundos |
| Memória residente por processo | encerramento ao detectar mais de 512 MB |
| Corpo HTTP | 2 MB, inclusive sem Content-Length |
| Prazo HTTP total, incluindo leitura do corpo | prazo do worker + espera na fila + 5 segundos (20 por padrão), com encerramento da conexão após mais 1 segundo |
| Arquivo nativo importado | 1 MB decodificado |
| Funcionários / turnos / regras de cobertura | 200 / 20.000 / 1.000 |
| Período de geração | 31 dias de calendário |
| Candidatos / operações de montagem mais caras | 30.000 / 300.000 |

Os valores de tráfego, concorrência, espera e recursos estão em
`backend/EscalaLivre.Api/appsettings.json`, seção `Protection`. Podem ser alterados
por variáveis como `Protection__SolvesPerMinute=6`. As opções são validadas ao
iniciar. Aumente os limites somente após medir CPU, memória e latência sob carga.

As cotas são selecionadas pelos metadados do endpoint resolvido, após o roteamento,
sem comparar o texto do caminho. Gerações também consomem a cota geral; consultas
GET e cancelamentos DELETE de `/solve/jobs/{id}` consomem somente sua respectiva
cota por IP, além da proteção global de concorrência comum a todos os pedidos.
Tickets inexistentes também consomem cota: trocar o ticket não reinicia o limite.
Rotas não resolvidas usam a cota geral. Pedidos inválidos aos endpoints de geração
consomem as cotas geral e de geração; isso não depende de iniciar o cálculo.

Com polling a cada três segundos, cada usuário faz nominalmente 20 consultas por
minuto. O padrão de 1.200 permite nominalmente 60 usuários no mesmo NAT, sem margem
para consultas extras, reconexões ou rajadas. Cancelamentos têm orçamento separado
de 60 por minuto por IP. Configure `Protection__JobPollsPerMinute` e
`Protection__JobCancellationsPerMinute` conforme o uso; ambos aceitam 1–10.000.
As janelas são fixas de um minuto, sem fila. Não há garantia de disponibilidade
para cancelamento durante saturação da concorrência global. CORS e a exposição de
`Retry-After` permanecem aplicados às respostas 429.

Os limites de taxa, concorrência e fila são **por instância da API**. Com várias
réplicas, configure também cotas globais no gateway ou armazenamento compartilhado.
Limites por IP podem afetar empresas que compartilham uma conexão; ajuste-os com
base no uso real. Não há identidade de usuário confiável no modo sem cadastro.

Na fila assíncrona, capacidade de espera, execução e retenção são separadas.
O orçamento padrão de 128 MiB usa reserva de 4 MiB por ativo, substituída pelos
bytes reais do resultado ao concluir. Falhas/cancelamentos liberam o payload;
metadados e resultados válidos continuam consultáveis por dois minutos.
Uma nova reserva pode retornar 503 `queueFull` por orçamento ou metadados,
mesmo sem atividade. Não se descartam resultados dentro do prazo para admitir
novos pedidos. Os limites são configuráveis por `Protection__JobPayloadBudgetMb`
(4–512) e `Protection__JobRetentionLimit` (32–10.000). Grafos deserializados,
buffers transitórios, respostas HTTP em andamento e runtime ficam fora da conta
de payload; o limite real do host deve abranger esses custos e os workers.
Detalhes e justificativa em [fila de geração](processing-queue.md).

## Cálculos isolados

`/solve`, `/validate` e `/analyze` compartilham a mesma fila e executam em processos
filhos, usando o próprio executável da API com `--calculation-worker`. Não há shell
nem dados do usuário nos argumentos. A entrada e a saída usam pipes. O CP-SAT usa
um trabalhador de busca, com limite interno de cinco segundos. O prazo externo
também inclui a construção do modelo e a análise dos resultados.

O processo é encerrado e aguardado ao exceder o prazo, a memória, o tamanho da
saída ou ao desconectar o cliente. O slot só é liberado depois que o filho termina.
O encerramento normal da aplicação também cancela os cálculos. A publicação deve
preservar o executável .NET e permitir criar processos filhos; não use um ambiente
serverless que proíba esse recurso sem adaptar a execução para workers externos.

A memória é observada a cada 50 ms: pode haver um pico antes do encerramento.
`num_search_workers:1` controla o paralelismo da busca; não é uma cota de CPU do
sistema operacional. Configure limites rígidos de memória e CPU no container,
cgroup ou serviço de hospedagem, abrangendo a API e os filhos. Dimensione a
memória total considerando API, workers, entradas e respostas simultâneas.

## Domínio, proxy e TLS

Em produção, CORS não permite origens externas por padrão. Hospedar frontend e API
na mesma origem dispensa CORS. Para domínios separados, configure o endereço real,
sem barra final, por exemplo `Protection__AllowedOrigins__0=https://escala.exemplo.com`.
No frontend, configure `VITE_API_URL` com a URL da API. Sem essa variável, o build de
produção usa a própria origem; desenvolvimento usa localhost:5003.

`Protection:TrustedProxies` fica vazio por padrão. Somente endereços explicitamente
configurados podem fornecer X-Forwarded-For e X-Forwarded-Proto. Exemplo para um
proxy local: `Protection__TrustedProxies__0=127.0.0.1`. Há limite de um salto:
configure o proxy imediatamente anterior para enviar o IP real verificado e
sobrescrever cabeçalhos recebidos do público. Não confie em qualquer proxy.

Antes de publicar, configure HTTPS, os domínios aceitos em `AllowedHosts`, proteção
DDoS/WAF e firewall para impedir acesso direto à origem. HSTS é aplicado em HTTPS
em produção; atrás de proxy, a identificação de HTTPS depende da configuração
de proxies confiáveis. CORS não autentica nem bloqueia scripts fora do navegador.
Os cabeçalhos CSP são da API; configure uma política própria no host do frontend.

## Respostas, privacidade e operação

Pedidos inválidos retornam 400; excesso de corpo, 413; complexidade/memória, 422;
limite de chamadas, 429; fila cheia/espera excedida, 503; prazo do cálculo, 504.
429 e 503 incluem Retry-After. O frontend apresenta mensagens de espera e não
repete automaticamente cálculos dispendiosos. A importação valida Base64, UTF-8,
profundidade JSON, estrutura, referências, identificadores e limites dos dados.

Os logs da aplicação incluem rota conhecida, status, duração e bloqueios. Não
registram documentos, nomes, corpos ou mensagens de exceções contendo a entrada.
Não habilite logging de corpos no proxy ou APM. Configure retenção e alertas de
429/503/504, memória, CPU, tempo de cálculo, indisponibilidade e despesas na
hospedagem. Health indica que a API responde, sem iniciar um cálculo.

## Validação

A entrega 3 atualizou Zod para 4.6.7 e acrescentou verificação de coleções antes
da migração, incluindo documentos do armazenamento local. Auditoria npm de
produção em 31/10/2026 não apontou avisos; a cadeia de desenvolvimento ainda tem
11 pacotes sinalizados como moderados por minimatch. NuGet não apontou pacotes
vulneráveis, incluindo transitivos. Fontes, relatórios brutos, compatibilidade e
riscos restantes estão em [Zod e validação segura](decisions/015-zod-validation-security.md).
Auditorias devem ser repetidas: esse resultado não representa garantia permanente.

```sh
dotnet build EscalaLivre.slnx
dotnet test EscalaLivre.slnx --no-build
node backend/security.integration.cjs
cd frontend
npm run build
node --test tests/*.test.cjs
```

Os testes HTTP iniciam instâncias locais em portas temporárias e verificam
geração real, importação/exportação, entradas inválidas, corpo excessivo, CORS,
limites de taxa, cabeçalhos de IP forjados, sobrecarga, prazo, memória e cancelamento.
As regressões de cotas cobrem ambas as rotas de geração, caixa/barra final, cotas
independentes por IP e operação, tickets inexistentes e IP encaminhado aceito
somente de proxy explicitamente confiável.
Para build Release, defina `SECURITY_BUILD_CONFIGURATION=Release` no teste HTTP.
Teste a capacidade da hospedagem escolhida em ambiente separado antes de divulgar.

### Corpo HTTP e mensagem no cliente

O limite de corpo é 2 MiB (2.097.152 bytes). O cliente mede em UTF-8 o JSON
completo enviado a /solve e rejeita o excesso antes de iniciar fetch. Isso evita
que uma conexão encerrada durante o upload esconda a mensagem de limite.
Um status 413 no log do servidor confirma a rejeição local; não comprova que
o cliente recebeu a resposta. Para Content-Length acima do limite, a API rejeita
antes do binding, preserva CORS e permite que o Kestrel descarte o corpo declarado
sem provocar um segundo erro de tamanho. Somente esse pedido já rejeitado recebe
o limite de drenagem igual ao tamanho declarado; nenhum conteúdo chega ao solver.
Os limites de taxa continuam aplicados. A drenagem tem o timeout de cinco segundos
do [Kestrel](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/kestrel/request-draining?view=aspnetcore-10.0).
Uploads sem Content-Length continuam sujeitos ao limite de leitura do Kestrel e
podem observar erro de transporte se a conexão for encerrada durante o envio.
Não há repetição automática. O teste HTTP repete cinco uploads, incluindo 4 MiB,
verifica status, JSON e CORS e gera uma escala válida em seguida.

Os testes de integração também usam as ações reais de edição e persistência
do frontend, recarregam o documento e geram via HTTP com o solver real.
Cobrem autorização/revogação, troca de função e durações de 36 e 168 horas.
Essa camada não simula cliques nem substitui testes de interface no navegador.
