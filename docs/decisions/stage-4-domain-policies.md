# Etapa 4 — Políticas de domínio e contratos de regimes

Relatório histórico da respectiva etapa. Código/comandos atuais e fechamento das pendências: [revisão da etapa 6](stage-6-final-review.md).

Ambiente: Windows, SDK selecionado 10.0.402 por rollForward=latestFeature (global.json: 10.0.201), Node v24.17.0, npm 11.13.0; HEAD 66659daa2bbfc2384605946ec5b553e0bcd51eed.

Data: 26/10/2026. Estado: saída local atendida; CI remota e correção separada de D1 pendentes. As mudanças anteriores do checkout foram preservadas, sem commit ou integração.

## Conferência da etapa 3 e ajuste operacional separado

Antes da extração: 157 testes puros e 364 do adaptador aprovados ([puro](evidence/stage-4/analysis-baseline.txt), [backend](evidence/stage-4/backend-baseline.txt)). Incluem construção/coleções, operações, conflitos carregáveis e round-trip atual/legado. Nenhum schema/mapeador/agregado foi alterado na etapa 4.

A pendência operacional foi investigada primeiro. O teste original de deadline falhou isoladamente: após o timeout esperado de analyze, solve simples retornou 504, com worker em 1039ms para um limite de 1s. A causa interna dos milissegundos excedentes não foi isolada; a comparação não é uma medição de regressão de desempenho. O [registro da etapa 3](stage-3-protected-planning.md) já reproduzia a mesma falha sem seus tipos/mapeadores. A suíte completa original desta etapa passou 15/15 ([baseline](evidence/stage-4/security-baseline.txt)), confirmando a sensibilidade temporal; isso sozinho não foi tratado como resolução da intermitência.

Foi feito um ajuste de teste separado da refatoração: o teste de deadline da análise agora confirma recuperação pelo mesmo analyze simples, com limite ainda de 1s, ConcurrentWorkers=1 e QueueLimit=0. Exige 504/calculationTimeout no trabalho pesado, health 200 e analyze 200/envelope de sucesso depois; um slot retido produziria 503. Remove a exigência incidental de inicialização fria do solver nativo em menos de 1s. A geração, seus envelopes, cancelamento e recuperação continuam nos demais testes com o worker real. Nenhum parâmetro de produção, orçamento, timeout ou isolamento foi ampliado.

A suíte inteira após esse ajuste e antes da extração passou 15/15 ([gate](evidence/stage-4/security-gate.txt)). Assim a saída local da etapa 3 pôde ser encerrada pelo contrato operacional testado, sem alegar que solve sempre cabe em 1s ou que houve ganho de desempenho. O teste anterior de fila ainda usa solve/1s e permanece um risco temporal herdado a acompanhar na CI. CI Linux/Node 22 não executada nesta sessão; integração depende dela.

## Implementação e comportamento preservado

- Políticas coesas de jornada líquida/herança/dia/semana, descanso, ciclo móvel, intervalos, disponibilidade e permissões de entrada/calendário. Diagnóstico/estratégias compartilham esses predicados, preservando a diferença entre descanso exclusivo do regime e o máximo da empresa.
- Diagnósticos, redação, ordem e resultado de leitura preservados; 58 hashes completos anteriores continuam aprovados. ScheduleRules, LaborRules e ScheduleWindow mantêm delegações para consumidores em transição.
- Resolvedor sem instanciação concreta; registros em API.AddScheduleAnalysis. Testes puros e de DI demonstram uma terceira estratégia, snapshot do registro, desconhecidos e duplicações inclusive por caixa.
- GetNextEligibleStart renomeado para EstimateStartAfterRest; mesma aritmética e nenhuma promessa global sem histórico. CanWork mantém capacidade parcial e entradas documentadas no [ADR 006](006-scheduling-policies-and-regime-contracts.md).
- Módulos TS correspondentes em lib/policies, sem regra nova em React/Zustand. Exports existentes preservados. Vinte fixtures de regimes distintas das 58 de documentos; as 20 passaram também contra cópias isoladas dos regimes anteriores ([comparação](evidence/stage-4/legacy-contracts.txt)).
- Adaptador consome políticas de descanso/ciclo/jornada em horas/noite; modelo, cobertura por atribuição, pesos, busca, limites e worker preservados. D1 continua reproduzida. Tipos desconhecidos da empresa/pessoa continuam rejeitados em HTTP 400, com novos asserts de integração.

## Verificações e falhas distinguidas

| Verificação | Resultado | Evidência |
| --- | --- | --- |
| Análise/domínio sem Infrastructure/API/OR-Tools | 184/184 (157 anteriores + 27 contratos) | [puro](evidence/stage-4/analysis-final.txt) |
| Backend, adaptador real, composição e documentos | 365/365 (364 anteriores + composição extensível) | [backend](evidence/stage-4/backend-final.txt) |
| Frontend | 369/369 (349 anteriores + 20 contratos) | [frontend](evidence/stage-4/frontend-final.txt) |
| Frontend em America/New_York | 369/369; TZ restaurado | [NY](evidence/stage-4/frontend-new-york-final.txt) |
| Lint | exit 0 | [lint](evidence/stage-4/lint-final.txt) |
| Frontend build | exit 0 | [build](evidence/stage-4/frontend-build-final.txt) |
| API Release | exit 0, zero avisos/erros | [API](evidence/stage-4/api-build-final.txt) |
| HTTP/worker Release, após extração | 15/15; paridade completa dos 58 documentos | [HTTP](evidence/stage-4/security-final.txt) |
| Regimes originais isolados, novos casos | 20/20 | [originais](evidence/stage-4/legacy-contracts.txt) |

Falha anterior: deadline de 1s, acima, com evidências da etapa 3 preservadas. Falha introduzida e corrigida: primeira compilação TS apontou TS2345, pois worksDuringLunchClosure é opcional e o predicado extraído exigia boolean obrigatório. O parâmetro agora preserva o padrão falso; build final aprovado ([falha intermediária](evidence/stage-4/frontend-build.txt)). Nenhuma falha de regra foi ocultada por atualização dos 58 documentos ou de seus hashes. Testes HTTP foram executados após os demais checks, sem carga concorrente de build/testes.

## Saída, limites e próximas pendências

A [matriz atual](../rule-parity.md) relaciona as 26 famílias às políticas C#/TS e à tradução/diagnóstico; os casos de fronteira do inventário da etapa 1 continuam válidos. Contratos de registro e capacidades estão testados sem Infrastructure. A configuração tipada da etapa 3 continua na fronteira de comandos; políticas leem projeções para diagnosticar conflitos sem construir objetos estritos em cada cálculo.

Não foi comprovada nova divergência de negócio. D1 impede declarar equivalência global entre modelo e análise e concluir a etapa 5: requer correção separada com cenário já existente, preservando histórico. A decomposição matemática e a rejeição de novas violações obrigatórias ainda pertencem à etapa 5. CI remota/Linux/Node 22 e execução exata com SDK de global.json permanecem pendentes antes da integração (ambiente local usa roll-forward conforme baseline). Não há medição de desempenho nesta entrega.

Rollback desta etapa: repor os corpos dos helpers/regimes e o construtor antigo da fábrica junto de seus consumidores/testes; remover as novas políticas, registros e fixtures somente após restaurar os delegadores. O ajuste operacional do teste é revisável separadamente. Nenhuma migração de arquivo ou rollback de dados é necessário. O staging e a cópia dos fontes anteriores estão em Documents/escalalivre-stage4, fora do repositório; os logs reproduzíveis desta entrega ficam em evidence/stage-4.
