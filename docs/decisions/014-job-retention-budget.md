# Entrega 2 — admissão, execução e retenção da fila

Data: 31/10/2026. `review/PLANO-CORRECAO.md` não está presente neste checkout;
foram usados os requisitos da solicitação. As correções HTTP da entrega 1 foram
preservadas. Não houve publicação nem mudança nas regras de escala.

## Reprodução anterior à correção

Foi acrescentado primeiro o teste
`MoreThanThirtyTwoSmallCompletionsDoNotBlockAdmissionOrEvictResults`. Com a API
anterior, `dotnet test backend/EscalaLivre.Api.Tests/EscalaLivre.Api.Tests.csproj
-c Release -m:1 --filter MoreThanThirtyTwoSmallCompletions` falhou na 33ª admissão
com 503 `queueFull`, apesar de todos os pedidos anteriores estarem concluídos.
O teste agora conclui 40 pedidos pequenos e consulta todos os resultados.

## Decisão

O limite `jobs.Count >= 32` foi substituído por controles independentes:

- Espera: `JobQueueLimit`, mantido em 20 por padrão, com FIFO.
- Execução: `ConcurrentWorkers`, mantido em um por padrão. O runner real continua
  aguardando o encerramento do processo antes de retornar/liberar seu slot.
- Metadados: `JobRetentionLimit=1024`, contando ativos e finalizados. É um teto
  explícito para tickets, timestamps e mensagens, inclusive falhas/cancelamentos
  sem payload. O valor permite mais resultados pequenos que o limite anterior,
  mas não representa uma capacidade de carga medida; pode ser ajustado em 32–10.000.
- Payload: `JobPayloadBudgetMb=128` MiB, ajustável em 4–512. Cada ativo reserva
  4 MiB, independentemente do tamanho da entrada. Entradas e resultados têm teto
  de 4 MiB serializados. A conclusão troca a reserva pelos bytes reais do resultado;
  falha/cancelamento libera a reserva e mantém somente os metadados.

Os 128 MiB conservam o teto nominal anterior de resultados (32 × 4 MiB), agora
incluindo a reserva de ativos no mesmo orçamento. Os 21 ativos possíveis no padrão
reservam 84 MiB; a configuração máxima de oito workers e 20 aguardando reserva
112 MiB. O restante pode ser usado para resultados. Orçamento pequeno ou muitos
resultados grandes podem, legitimamente, impedir uma nova reserva mesmo sem
trabalho ativo. A escolha é recusar admissão com 503 `queueFull`, preservando
integralmente os resultados durante o prazo contratado.

A reserva de 4 MiB garante espaço para um resultado no tamanho máximo sem remover
outros resultados na conclusão. A fila mantém snapshots UTF-8 de entrada/resultado,
em vez dos grafos de objetos, e a escrita interrompe a retenção ao exceder o teto.
Uma falha de serialização na admissão não registra ticket nem debita orçamento.
Erros retidos ficam limitados a 512 caracteres. CancellationTokenSource existe
somente durante execução e é descartado na finalização. Avisos de trabalho usam
um semáforo com no máximo um sinal pendente: cancelar pedidos aguardando não
acumula indefinidamente permissões sem utilidade.

**128 MiB de payload não equivalem a 128 MiB de RSS/heap.** Deserialização para
execução/consulta, buffers/cópias temporários de serialização, grafos devolvidos
pelo runner, metadados, runtime/GC e processos filhos custam memória adicional.
Um leitor já iniciado pode manter referência ao snapshot expirado até terminar.
Os limites HTTP de concorrência/corpo e os limites de execução dos workers
permanecem aplicados. Dimensionamento e limite rígido do host/container continuam
necessários; não houve medição de memória real nem teste de capacidade nesta entrega.

## Retenção, concorrência e liberação

Todos os estados finais, inclusive erro/cancelamento, ficam consultáveis por dois
minutos desde a finalização. Nenhum resultado é removido antecipadamente para
admitir outro pedido. Cancelamento repetido de estado final é idempotente e não
reinicia o prazo. O primeiro instante com idade de dois minutos já retorna
`jobExpired`. Pedidos em execução não expiram pela limpeza de resultados.

O relógio e o timer de limpeza usam `TimeProvider`; produção registra
`TimeProvider.System`, e os testes controlam tempo e ticks sem aguardar dois minutos.
Limpeza periódica ocorre a cada 30 segundos, e também em Get/Enqueue/Cancel.
Sem tráfego, liberar referências expiradas pode levar mais 30 segundos; a próxima
admissão já limpa antes de avaliar a capacidade.

O mesmo lock protege finalização, timestamp, contabilização, metadados e limpeza.
Leituras capturam estado/payload coerentes sob o lock e deserializam fora dele.
Cancelamento de espera libera reserva imediatamente; o de execução só libera
reserva e vaga após o runner retornar, mesmo se retornar sucesso após receber o
cancelamento. Stop cancela pedidos aguardando e aguarda os executores pelo
contrato do BackgroundService. FIFO e o paralelismo configurado permanecem.

## Verificação

Testes acrescentados cobrem:

- 40 conclusões pequenas sem bloqueio nem remoção de resultados anteriores.
- Retenção até 119 segundos e expiração em 120, contados após concluir um job
  que permaneceu cinco minutos em processamento no relógio controlado.
- Orçamento totalmente reservado por ativo; resultado retido que impede nova
  reserva; recuperação pela expiração; exatidão do tamanho debitado.
- Teto de metadados, cancelamentos repetidos, falha conhecida/mensagem limitada,
  resultado excedido e falha de admissão sem vazamento de reserva ou ticket.
- Fronteira exata de 4 MiB e rejeição de um byte adicional.
- Preservação integral do resultado (turno noturno com segundos/pausa, IDs/tags,
  conflitos, cobertura, lacunas, sugestões e decisões) e isolamento contra mutação
  da entrada, do resultado do runner e do snapshot entregue pela consulta.
- Fila cheia, FIFO, dois executores paralelos e cancelamento que aguarda a saída
  do runner antes de liberar orçamento/vaga.
- Consulta, cancelamento, conclusão e limpeza concorrentes; limpeza periódica
  sem chamada HTTP; liberação do payload no encerramento.
- Fronteiras de configuração dos dois novos limites.

Resultados locais finais:

| Verificação | Resultado |
| --- | --- |
| `dotnet test EscalaLivre.slnx -c Release -m:1` | 664 aprovados: 379 adaptador, 239 análise/domínio, 33 API e 13 arquitetura |
| `SECURITY_BUILD_CONFIGURATION=Release` + `node backend/security.integration.cjs` | 22/22 aprovados, incluindo todas as regressões HTTP da entrega 1 |
| `npm --prefix frontend run lint` e `npm --prefix frontend run build` | Aprovados |
| `node --test frontend/tests/*.test.cjs` | 469/469 em UTC e 469/469 em America/New_York |
| `node tools/parity-differential.cjs` | 142/142 em cada um desses dois fusos |
| Documentação e diff | Conteúdo/links locais revisados; `git diff --check` sem problemas |

Ambiente local: Windows, SDK .NET 10.0.401 (roll-forward permitido), Node 24.14.1.
A validação local não substitui a execução remota em Ubuntu/Node 22.

## Limitações restantes

Estado e limites continuam por instância e em memória; reiniciar perde tickets.
Retenção não garante acesso após o prazo nem contra reinício. Recusar novas
reservas é necessário quando orçamento/metadados se esgotam: a correção não
promete admissão ilimitada. Consultas de resultados agora deserializam o snapshot,
com custo de CPU/alocação não medido. Não houve alteração do worker real nem
certificação de carga/RSS. A CI remota deste diff ainda é necessária antes da
integração. Consulte [fila](../processing-queue.md) e [segurança](../SECURITY.md).
