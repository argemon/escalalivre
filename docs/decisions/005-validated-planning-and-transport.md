# ADR 005 — Planejamento protegido e fronteira de transporte

Data: 26/10/2026. Estado: implementado progressivamente na etapa 3. Complementa ADRs [001](001-planning-consistency-boundaries.md), [002](002-civil-time-and-units.md) e [004](004-conflicting-documents-and-known-divergences.md), sem nova regra de escala.

## Tipos e unidades

Domain.Planning contém CivilWindow, ShiftPause, CivilPlanningPeriod, Duration, DayCount, WholeHours e WeeklyHours. São classes com construção validada e propriedades somente leitura, evitando o estado inválido produzido por default de uma struct e a modificação por init/with. Não há conversões implícitas entre dias, horas e duração.

CivilWindow exige fim maior que início, DateTime Unspecified e precisão de segundos; não converte instantes nem arredonda entradas. Interseção é semiaberta. CivilPlanningPeriod contém de 1 a 31 datas inclusivas entre 1900 e 2100. Duration aceita zero e mais de 24h, mas exige segundos inteiros; a jornada padrão da configuração exige duração positiva. WeeklyHours preserva double finito positivo, inclusive frações. Os limites operacionais/de aceitação existentes continuam em DocumentSafety, sem serem reinventados como regras de jornada.

RegimeConfiguration distingue DayCycleConfiguration (WorkDays/RestDays) e HourCycleConfiguration (WorkHours/RestHours). Construção exige trabalho positivo, descanso não negativo e ciclo sem overflow. O mapeamento conserva os inteiros e as horas semanais do contrato atual. Isso não altera a resolução de estratégias nem CanWork/GetNextEligibleStart, previstos para a etapa 4.

## Estrutura e conformidade de pausas

ShiftPause contém uma janela positiva; ScheduledAssignment exige que ela esteja contida no turno, permitindo igualdade nas bordas. **A exigência de pausa estritamente interna é conformidade diagnosticável, não rejeição de carregamento.** Essa distinção esclarece a formulação do ADR 002: o formato atual aceita pausas encostadas nas bordas e as diagnostica com interval. Também continuam representáveis pausa longa, ausência de pausa obrigatória, excesso de jornada, descanso insuficiente, sobreposições e divergência de função.

Não se criam objetos internos com janela invertida, pausa fora do turno, ID vazio/duplicado ou proprietário inexistente no agregado. DTOs e projeções de leitura ainda podem representar entrada inválida para a validação estrutural/diagnóstico legados; a introdução de tipos não muda a aceitação de importação/API nem descarta arquivos conflitantes.

## Limite do agregado e proteção das coleções

PlanningSchedule usa a identidade do documento, sem introduzir novo ID serializado. Mantém atribuições completas, IDs de proprietários e período de seleção. Assign, Update, Remove, Move, ReplacePeriod, ChangePeriod e ChangeEmployeeRole são operações explícitas. Update preserva o ID; ReplacePeriod valida o conjunto antes de confirmar, substitui por data inicial e conserva turnos inteiros fora do período. Não impede conflito de descanso/jornada como condição para editar.

PlanningSettings é um snapshot separado de empresa/pessoas, com configurações de regime tipadas. Não há agregado gigante do documento, repositório ou persistência nova. PlanningEditor coordena configuração e atribuições: alteração de empresa conserva horários; edição explícita da pessoa atualiza a função dos seus turnos em todo o histórico. Move desloca a pausa junto e remove a autorização de feriado da data antiga quando muda o dia; não ajusta automaticamente uma pausa incompatível com um redimensionamento estruturalmente inválido.

As novas coleções usam ImmutableArray/ImmutableDictionary e cópias na entrada. Os valores/atribuições não expõem setters ou init públicos. Uma inspeção mostrou que Array.AsReadOnly pode expor o array por ICollection.SyncRoot; por isso as novas estruturas não dependem somente desse wrapper. Há testes de mutação via IList, fontes originais, snapshots antigos e sincronização pública. Não são garantias contra reflection/unsafe.

## Fronteira de transporte e transição

Application.Contracts.Documents declara 15 DTOs espelhando somente o formato público. ScheduleDocumentMapper converte DTOs para projeções de compatibilidade e vice-versa, preservando nomes, ordem, valores, opcionais e ausência versus coleção vazia. ScheduleJson usa esses DTOs no conversor do documento, após as conversões temporais legadas já existentes.

PlanningDocumentMapping transforma uma projeção estruturalmente aceita em PlanningSchedule/PlanningSettings e devolve uma projeção, sem migrar ou reparar horários. Mantém o envelope, catálogo de funções, setup e timestamp fora do agregado. A ausência de planningPeriod pode ser preservada na ida e volta interna; a inferência de período legado permanece no importador existente. Alterar explicitamente o período o escreve no documento.

ScheduleModels.cs permanece como **projeção de leitura/compatibilidade**, não como API de construção dos novos agregados. Políticas e adaptadores existentes ainda consomem essas projeções, sem atributos/infraestrutura de JSON no domínio. Essa convivência é deliberada: não afirmar que todos os tipos antigos passaram a proteger invariantes. Os objetos internos protegidos e os DTOs são tipos distintos, unidos por mapeadores em Application; próximas etapas podem migrar consumidores das políticas sem quebrar o contrato público C# ou JSON.

## Operações na aplicação e geração

PlanningEditor expõe comandos de atribuição, edição, exclusão, movimento, substituição, período, empresa e pessoa. Recebe explicitamente o instante de atualização e retorna documento novo com análise canônica. Falhar um comando não altera a entrada. Está registrado na composição de análise, sem novo endpoint ou chamada remota na experiência local-first do frontend.

GenerateSchedule aplica seleções bem-sucedidas por PlanningSchedule.ReplacePeriod e confere se o resultado proposto conserva todo o histórico, ordem, IDs, horários e metadados fora do período. Uma violação desse contrato estrutural falha sem aplicar a proposta. Na falha do otimizador permanece o fluxo anterior de preservação. Para compatibilidade, o contêiner de resposta e referências de atribuições preservadas continuam os mesmos quando a proposta concorda com a operação protegida.

Essa conferência não é a rejeição de novas violações obrigatórias prevista para a etapa 5: conflitos de negócio continuam relatados pelo avaliador. D1 permanece reproduzida. Os comandos locais TypeScript, endpoints, worker e protocolos não mudaram nesta etapa.

## Verificação e consequências

Ver [relatório da etapa 3](stage-3-protected-planning.md). Testes exigem construção inválida, unidades, bordas temporais, atomicidade, identidade, cópias profundas, migração temporal idempotente e round-trip atual/legado; os hashes da etapa 2 e o arquivo de cenários compartilhados não foram alterados. Nenhuma migração ou versão de schema nova é necessária.

Seguimento de consolidação: [ADR 008](008-final-boundaries-and-validation.md) e [revisão final](stage-6-final-review.md). Nomes/estados anteriores neste registro são históricos.
