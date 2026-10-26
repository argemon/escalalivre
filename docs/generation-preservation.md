# Geração e preservação de turnos

O período usa datas inclusivas. Um turno pertence à data em que começa: gerar de 19 a 21 substitui por inteiro os turnos iniciados nesses dias, inclusive um turno que começa às 22h do dia 21 e termina às 6h do dia 22. Um turno iniciado às 22h do dia 18 e terminado às 6h do dia 19 permanece intacto. Nenhum turno é recortado, dividido, deslocado ou retaggeado pela substituição.

Todos os turnos fora do período, anteriores e posteriores, são decisões fixas. O solver:

- Impede sobreposição e exige o maior descanso entre o mínimo da empresa e o descanso do regime em horas, inclusive antes do primeiro e depois do último turno gerado. O descanso exatamente igual ao mínimo é permitido.
- Deduz os dias fixos anteriores e posteriores de cada janela móvel do ciclo em dias que alcança o período. O dia trabalhado é a data de início do turno.
- Deduz o trabalho fixo de cada semana civil (domingo 00h até domingo seguinte 00h). Horas efetivas são divididas na virada da semana, descontando apenas a parte do intervalo que pertence a cada semana. Um turno noturno pode consumir saldo nas duas semanas.
- Inclui turnos preservados que atravessam a borda no cálculo de cobertura, sem gerar outra pessoa para uma demanda já atendida.

A resposta de geração bem-sucedida contém o documento completo de turnos: preservados mais gerados. A interface aplica somente os turnos retornados que começam no período e mantém os originais fora dele, mesmo ao receber uma resposta de servidor antigo ou completo. Isso evita duplicação e protege os dados externos ao período.

Se o solver não encontrar solução viável ou atingir o tempo limite sem solução, retorna os turnos originais e um conflito solverInfeasible ou solverTimeout; a interface não substitui nenhum turno. Uma solução parcial com lacunas pode ser aplicada normalmente. Violações que já existiam entre turnos preservados continuam visíveis; o solver não altera o histórico para corrigi-las e não adiciona trabalho a semanas ou ciclos cujo saldo já foi consumido.

## Admissão canônica — etapa 5

Uma proposta optimal/feasible passa pelo agregado e pelo avaliador completo antes de ser aplicada. Apenas conflitos de atribuições idênticas retidas são herdados; códigos agregados já existentes não autorizam trabalho novo a agravar semana, ciclo ou descanso. Nova violação obrigatória ou alteração estrutural/histórica devolve invalid/solverInvalid com os turnos originais e nenhuma decisão aplicada. Não se aplicam apenas os turnos válidos de um lote rejeitado. Lacunas continuam permitindo escalas parciais. O cliente já trata esse status/código preservando o documento.

A correção D1 passa a contar pessoas distintas na tradução de cobertura, sem remover turnos preservados sobrepostos. Políticas e exemplos: [ADR 007](decisions/007-optimization-translators-and-admission.md), [cenários de regressão](../shared/solver-regression-scenarios.json).
