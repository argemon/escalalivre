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
O serviço aceita no máximo 32 pedidos retidos, inclusive resultados, e resultados de até 4 MiB.
Concluídos expiram após dois minutos. A limpeza ocorre periodicamente e na consulta/admissão.
Fila cheia retorna 503; submissão continua limitada por IP. Consultas usam limite global separado de 1200/min para que a mesma rede possa acompanhar vários pedidos.

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
