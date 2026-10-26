# Otimização e avaliação

OrToolsScheduleOptimizer implementa IScheduleOptimizer; GenerateSchedule é o caso de uso que protege a aplicação do resultado. AnalyzeSchedule e ValidateSchedule usam o mesmo avaliador puro e não invocam o otimizador. A fachada OrToolsScheduleSolver não existe mais no código de produção.

## Construção e execução

ScheduleCandidateGenerator produz entradas e pausas com as regras/granularidades anteriores. OptimizationBudget limita candidatos/fixos e passos de construção. ScheduleModelInput conserva o histórico dos dois lados; ScheduleModelBuilder cria variáveis e aplica as famílias registradas: atribuições fixas, exclusividade diária, descanso, trabalho semanal, ciclo móvel e cobertura. As políticas do domínio fornecem elegibilidade, janelas e saldos; somente Infrastructure traduz para CpModel/BoolVar/LinearExpr e executa CpSolver.

ScheduleObjective mantém penalidade de déficit por minuto × 1.000.000.000, recompensa de presença × 10.000, custo por turno 1.000.000 e ajuste limitado de preferências/pausa/fechamento. OrToolsExecution usa 5s e um worker. Grade e limites de busca são operacionais, não regras legais; aceitar um documento não garante que o gerador reproduza exatamente seus horários.

## Restrições e cobertura parcial

O modelo impõe exclusividade diária, descanso, saldo semanal e ciclo; candidatos usam diagnóstico canônico para jornada, pausa, disponibilidade, dias/horários, noite, entrada fixa e autorizações. Cobertura insuficiente é uma penalidade no objetivo, não uma obrigação matemática de cobertura integral. Portanto optimal pode coexistir com lacunas. Esse texto corrige a descrição antiga que classificava toda cobertura como restrição obrigatória; o comportamento não mudou.

Atribuições preservadas continuam fixas. CoverageConstraints usa o OR das atribuições por pessoa/bloco; não duplica a capacidade de uma pessoa com turnos sobrepostos. Alocações direcionais de funções compartilham uma capacidade por pessoa, enquanto equipe conta presença. Pausa não cobre, e histórico não é apagado para ocultar conflito.

## Leitura e admissão

ScheduleResultReader mapeia Optimal/Feasible/Unknown/Infeasible/ModelInvalid para os status anteriores. GenerateSchedule confere a fronteira pelo agregado, reavalia o documento proposto e recusa novas violações obrigatórias ou agravamento de conflitos herdados. Falha devolve atribuições originais; invalid/solverInvalid também é reconhecido pelo store. Uma lacuna isolada permite escala parcial.

Cobertura, lacunas, score, contratação e sugestões pertencem à avaliação pura. HiringDemand considera horas-pessoa por semana civil, sem extrapolar semanas parciais nem limitar demanda a 44h; quantidade estimada é limite inferior por carga/simultaneidade. ScheduleExplanation descreve seleções aplicadas. Editar o documento remove a prova de otimização anterior.

Detalhes: [arquitetura](architecture.md), [paridade](rule-parity.md), [ADR 007](decisions/007-optimization-translators-and-admission.md), [testes](testing.md) e [medição](decisions/stage-6-performance.md).
