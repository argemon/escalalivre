# ADR 007 — Tradução matemática e admissão da geração

Data: 26/10/2026. Estado: implementada na etapa 5. Extração, correção D1 e proteção de aplicação verificadas separadamente.

## Responsabilidades e composição

OrToolsScheduleOptimizer coordena a criação de um orçamento por cálculo, a entrada do modelo, a construção, a execução e a leitura. Não gera candidatos nem traduz restrições diretamente.

| Componente em Infrastructure.Solver | Responsabilidade |
| --- | --- |
| ScheduleCandidateGenerator | Mesmas janelas, entradas, opções/grade de pausas, tags, diagnóstico/filtros e geração de IDs anteriores |
| OptimizationBudget | 30.000 candidatos, incluindo turnos fixos de cobertura; 300.000 passos instrumentados, com contador por chamada |
| ScheduleModelInput | Seleção do período, histórico completo por pessoa, feriados autorizados e turnos fixos que podem cobrir as bordas |
| ScheduleModelContext | Modelo, variáveis e termos intermediários de um cálculo, sem estado compartilhado entre chamadas |
| ScheduleModelBuilder | Criação das variáveis e aplicação das famílias registradas; não conhece a lista concreta de tradutores |
| FixedAssignmentConstraints | Fixa histórico e autorizações; mantém revalidação dos turnos autorizados selecionados |
| DailyExclusivityConstraints | No máximo um turno por pessoa/data de início |
| RestConstraints | Incompatibilidades entre candidatos e histórico de ambos os lados e entre pares de candidatos |
| WeeklyWorkConstraints | Trabalho líquido em cada semana civil, deduzindo histórico fixo |
| DayCycleConstraints | Capacidade de datas iniciais em janelas móveis, deduzindo datas fixas distintas |
| CoverageConstraints | Presença por pessoa/bloco e alocação direcional para funções, com déficit permitido |
| ScheduleObjective | Coeficientes e composição de toda a função objetivo |
| OrToolsExecution | CP-SAT real, máximo de 5s e um worker de busca |
| ScheduleResultReader | Mapeamento dos status, seleção de variáveis e substituição preservando o período |

API.AddScheduleOptimization registra as seis famílias e os componentes. LegacySolverComposition é somente a raiz temporária da fachada legada usada nos testes; sua remoção pertence à etapa 6. Os tradutores são sem estado; modelo e orçamento não são singletons. Domain/Application/API não declaram tipos de OR-Tools; CpModel, BoolVar, LinearExpr e CpSolver permanecem nos componentes de Infrastructure (e nos testes do adaptador). ScheduleCapacityPolicy fornece saldos em ticks/datas; EffectiveWorkPolicy, RestPolicy, DayCyclePolicy e os helpers canônicos fornecem a semântica das restrições.

## Contratos operacionais e objetivo preservados

O gerador mantém entradas a cada 30min, limites da operação/disponibilidade, entradas fixas, pausas discretas com bordas/preferência e margem de 1min. Não se amplia a busca para prometer reproduzir todo horário válido. O orçamento mantém as comparações >30.000 e >300.000. A contagem de passos continua por comparação de descanso, exigência de cobertura e par atribuição elegível/exigência. A correção D1 deduplica a capacidade, mas mantém a cobrança por atribuição elegível anterior; os limites não representam uma contagem exata de todas as restrições CP-SAT.

Coeficientes: déficit por bloco = -(long)(minutos × 1.000.000.000); presença no bloco = (long)(minutos × 10.000); atribuição = -1.000.000 + clamp(preferências + (long)equilíbrio de pausa + bônus de fechamento 100, -1000, 1000). Mantidos truncamento dos coeficientes de blocos fracionários e aritmética de TimeOfDay da preferência de almoço. Nenhuma prioridade, peso, discretização, limite ou parâmetro de produção foi ajustado.

| Status CP-SAT | Status público | Resultado |
| --- | --- | --- |
| Optimal / Feasible | optimal / feasible | Proposta sujeita ao agregado e à reavaliação canônica |
| Unknown | timeout + solverTimeout | Atribuições originais; nenhuma seleção aplicada |
| Infeasible | infeasible + solverInfeasible | Atribuições originais |
| ModelInvalid/outro insucesso | invalid + solverInvalid | Atribuições originais |

Complexidade continua ScheduleComplexityException/worker exit 2/HTTP 422; timeout externo continua HTTP 504; cancelamento do chamador encerra o processo filho antes de liberar seu slot. Não se introduziu outro mecanismo de cancelamento ou uma assinatura nova na porta síncrona. O overload interno de OrToolsExecution com zero segundos existe para testar Unknown real; a composição de produção continua usando 5s fixos.

## Correção separada D1

A extração sem mudança de cobertura passou nos mesmos 365 testes anteriores. Só depois foi substituído o tradutor de cobertura: para cada bloco, presença da pessoa é o OR das suas atribuições que cobrem o bloco; equipe soma essas presenças, e alocações por função compartilham capacidade máxima de uma por pessoa. Uma mesma presença pode integrar equipe e função, conforme o avaliador; duas funções não podem consumir a mesma pessoa simultaneamente.

A sonda compara o tradutor extraído antigo e o corrigido com OR-Tools real nos escopos equipe e função direcional: antes score 0,5/duas atribuições, depois score 1/três atribuições, sem reescrever as duas históricas. O risco por inspeção de função do ADR 004 foi assim reproduzido e corrigido também. Cenários em shared/solver-regression-scenarios.json verificam o mesmo contrato em C#, TS e HTTP; o TS já contava pessoas e não precisou de correção. Diagnósticos de sobreposição e demais conflitos herdados continuam visíveis. Não se afirma equivalência universal entre todo modelo possível e o avaliador apenas por corrigir D1.

## Admissão da proposta na Application

GenerateSchedule só aplica optimal/feasible após PlanningDocumentMapping.ApplyGeneration proteger estrutura/histórico e IScheduleAnalyzer avaliar a proposta completa. GenerationConformance classifica os erros canônicos; não implementa um segundo diagnóstico nem considera lacunas de cobertura violações obrigatórias.

O baseline de herança usa somente atribuições exatamente iguais às originais que permaneceram na proposta: ID, pessoa/função, início/fim/pausa com Kind, source e sequência de tags. Diagnósticos são comparados como multiconjunto, incluindo todos os campos. Remover um turno inválido não permite transferir sua violação para outro turno com os mesmos horários.

Um código de erro já presente não libera agravamento: weeklyLimit considera trabalho novo na semana; dailyLimit/multipleShifts consideram a data inicial; regime em dias considera nova data na janela do diagnóstico, inclusive quando o erro aparece no histórico posterior; minimumRest considera participação da adição no conflito. Erros de um turno usam sua janela e pessoa. Famílias novas sem contrato de participação são conservadoras: uma adição da pessoa no contexto do erro é recusada até explicitar a regra. Uma adição em semana/pessoa não afetada não invalida todo documento por conter conflito histórico.

Nova violação ou estrutura/histórico inválido resulta em **invalid/solverInvalid**, sem formato/status novo. Retorna análise do documento original e decisions vazio. Os códigos da proposta rejeitada aparecem resumidos na mensagem de solverInvalid; não se misturam diagnósticos de turnos não aplicados aos conflitos canônicos do documento devolvido. Em qualquer insucesso, mesmo que uma porta defeituosa devolva atribuições diferentes, a aplicação escolhe as originais. Exceção de cancelamento é propagada sem mutação. O store já trata solverInvalid e mantém o documento; o teste de preservação foi ampliado para esse código.

A avaliação da proposta não confirma a aplicação parcial dos turnos válidos: o lote inteiro é aceito ou recusado. Conflitos herdados permanecem carregáveis/editáveis/diagnosticáveis e não são corrigidos automaticamente.

Evidências, limites de ambiente e rollback: [relatório da etapa 5](stage-5-optimization-adapter.md). Contratos temporais e paridade: [matriz](../rule-parity.md).

Seguimento de consolidação: [ADR 008](008-final-boundaries-and-validation.md) e [revisão final](stage-6-final-review.md). Nomes/estados anteriores neste registro são históricos.
