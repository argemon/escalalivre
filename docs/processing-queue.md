# Fila de geração

A interface envia `POST /solve/jobs` com o mesmo documento e período de `/solve`.
A resposta 202 contém um token secreto aleatório (256 bits), estado e estimativas.
`GET /solve/jobs/{id}` consulta o andamento e entrega o resultado quando pronto.
`DELETE /solve/jobs/{id}` cancela; um cálculo em andamento mantém o slot até seu processo terminar.
Os tokens permitem consultar/cancelar o próprio pedido: não os registre em logs de proxy.

Estados: `queued`, `processing`, `completed`, `failed`, `cancelled`.
A posição conta apenas os pedidos aguardando; `jobsAhead` inclui os que estão processando.
A estimativa usa média móvel dos cálculos recentes (inicialmente oito segundos) e o número de trabalhadores.
Não é uma promessa de prazo nem percentual de conclusão. Há relógio de tempo decorrido e aviso se o processamento supera a estimativa.

Configuração econômica padrão: `Protection:ConcurrentWorkers=1`, `Protection:JobQueueLimit=20`.
O cálculo continua limitado a 12 segundos e 512 MB pelo processo isolado já existente.
A fila assíncrona não usa o limite de três segundos de espera das chamadas síncronas.
A API mantém os endpoints síncronos por compatibilidade; eles compartilham os trabalhadores de cálculo.
Admissão, execução e retenção têm limites separados:

| Recurso | Limite padrão |
| --- | --- |
| Pedidos aguardando | `Protection:JobQueueLimit=20` |
| Pedidos em execução | `Protection:ConcurrentWorkers=1` |
| Tickets em memória, ativos e finalizados | `Protection:JobRetentionLimit=1024` |
| Payload serializado reservado/retido | `Protection:JobPayloadBudgetMb=128` MiB |
| Reserva por pedido ativo / máximo por entrada ou resultado | 4 MiB |
| Retenção de estado final e resultado | Dois minutos a partir da conclusão, falha ou cancelamento |

A admissão reserva 4 MiB até o runner retornar, mesmo durante cancelamento de um
processo em encerramento. Na conclusão, a reserva é substituída pelo tamanho real
do resultado UTF-8. Falhas e cancelamentos liberam o payload, preservando somente
o estado e uma mensagem de erro limitada a 512 caracteres. Cancelar um pedido
aguardando libera sua reserva imediatamente. Cancelar novamente um estado final
não reinicia o prazo de retenção nem remove um resultado concluído.

Assim, mais de 32 conclusões pequenas podem coexistir sem bloquear novas gerações.
Não há remoção antecipada de resultados para abrir vagas: durante os dois minutos
eles continuam consultáveis. Quando o orçamento ou o limite de tickets impede
nova reserva, a API retorna 503 `queueFull`, mesmo sem trabalho ativo. O limite de
tickets também contém o crescimento dos metadados de resultados pequenos, falhas
e cancelamentos, que consomem poucos ou nenhum byte de payload.

Os 128 MiB preservam o teto anterior de payload de resultados (32 × 4 MiB), agora
com reservas explícitas para ativos. No padrão, 21 ativos podem reservar 84 MiB;
com oito workers e 20 aguardando, 28 ativos podem reservar 112 MiB. O orçamento
restante é compartilhado com os resultados retidos. Ao usar um orçamento menor,
a admissão pode fechar antes de atingir o limite de espera configurado.
`JobPayloadBudgetMb` aceita 4–512; `JobRetentionLimit` aceita 32–10.000.

A fila guarda snapshots UTF-8 da entrada/resultado, sem reter seus grafos de
objetos. O teto de 4 MiB vale para a serialização interna normalizada; o corpo
HTTP continua limitado separadamente a 2 MiB. **Payload serializado não é memória real do processo:** objetos usados
no cálculo e na resposta HTTP, cópias/buffers temporários de serialização,
metadados, runtime/GC e processos filhos ficam além desse orçamento. Uma consulta
já iniciada pode manter seu snapshot até terminar mesmo após a expiração. O teto
não substitui limites de memória do host/container e medição em carga real.

Tickets finalizados expiram exatamente ao completar dois minutos. A limpeza usa
`TimeProvider`, executa a cada 30 segundos e também em consulta, admissão e
cancelamento. Assim, a recuperação física ociosa pode levar mais 30 segundos;
chamadas após o prazo já removem o ticket e liberam a contabilização antes de
prosseguir. A execução ativa nunca expira por esse mecanismo. Estado final,
timestamp e liberação da reserva são publicados atomicamente. FIFO, paralelismo
e o encerramento do processo filho antes de liberar sua vaga continuam preservados.
Fila cheia retorna 503. POST `/solve` e POST `/solve/jobs` compartilham a cota de geração por IP, inclusive com caixa diferente e barra final.
Consultas usam `Protection:JobPollsPerMinute` (1.200/min por IP); cancelamentos usam
`Protection:JobCancellationsPerMinute` (60/min por IP), sem disputar cota com as consultas.
Essas duas cotas também são independentes da cota geral, mas todas as operações
continuam sujeitas à concorrência global. Tickets inexistentes consomem cota.
O padrão de consultas acomoda nominalmente 60 usuários no mesmo NAT com polling
a cada três segundos; veja configuração e limitações em [proteção HTTP](SECURITY.md).

A fila fica em memória de **uma única instância**; reiniciar o servidor perde pedidos pendentes e resultados.
Mantenha a página aberta. Alternar as abas internas mantém a geração e impede duplicatas.
Recarregar ou fechar a página não recupera o token; pedidos já aceitos podem terminar no servidor.
Edições durante a espera não são sobrescritas por um resultado antigo: a interface pede uma nova geração.
Falhas temporárias ao consultar o estado são repetidas com o mesmo token; nunca reenviam o documento.
Para múltiplas instâncias, seria necessário armazenamento/fila compartilhados.

Publicação: frontend e API precisam receber esta atualização juntos. Permita GET/POST/DELETE em `/solve/jobs` no proxy e use HTTPS.

## Composição do cálculo (etapa 2)

O processo filho continua recebendo solve/validate/analyze pelo mesmo protocolo JSON. Nele, AnalyzeSchedule e ValidateSchedule resolvem a mesma porta IScheduleAnalyzer; apenas solve registra IScheduleOptimizer e executa GenerateSchedule. O supervisor, a fila e seus prazos/cancelamento não mudaram. Veja [arquitetura](architecture.md) e [evidências da etapa 2](decisions/stage-2-analysis-extraction.md).

## Verificação operacional na etapa 4

O teste de deadline da análise mantém 1s e verifica recuperação pelo mesmo analyze simples com um único slot/fila zero. A exigência de solve frio em menos de 1s foi retirada desse teste após reproduzir intermitência também na composição anterior. Testes próprios continuam exercitando geração/cancelamento/fila com worker real. Não houve mudança em timeout, protocolo, supervisão ou isolamento de produção. Justificativa e resultados: [relatório da etapa 4](decisions/stage-4-domain-policies.md).

## Consolidação da verificação — etapa 6

A sonda de recuperação da fila também usa analyze simples com 1s/um slot/fila zero, após a admissão/rejeição de solves concorrentes reais. A execução solve com orçamento normal e seu cancelamento continuam verificados. Isso remove uma exigência incidental de startup nativo subsegundo; não amplia o timeout de produção. Testes/CI agora têm fronteiras separadas. [Evidências e limitações](decisions/stage-6-final-review.md).
