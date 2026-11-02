# Otimização e avaliação

OrToolsScheduleOptimizer implementa IScheduleOptimizer; GenerateSchedule é o caso de uso que protege a aplicação do resultado. AnalyzeSchedule e ValidateSchedule usam o mesmo avaliador puro e não invocam o otimizador. A fachada OrToolsScheduleSolver não existe mais no código de produção.

## Construção e execução

ScheduleCandidateGenerator produz entradas e pausas em grade discreta. OptimizationBudget limita candidatos/fixos e passos de construção. ScheduleModelInput conserva o histórico dos dois lados; ScheduleModelBuilder cria variáveis e aplica as famílias registradas: atribuições fixas, exclusividade diária, rotina semanal/posicionamento dos intervalos, descanso, trabalho semanal, ciclo móvel e cobertura. As políticas do domínio fornecem elegibilidade, janelas e saldos; somente Infrastructure traduz para CpModel/BoolVar/LinearExpr e executa CpSolver.

ScheduleObjective mantém penalidade de déficit por minuto × 1.000.000.000, recompensa de presença × 10.000, custo por turno 1.000.000 e ajuste limitado de preferências/pausa/fechamento. OrToolsExecution usa 5s e um worker. Grade e limites de busca são operacionais, não regras legais; aceitar um documento não garante que o gerador reproduza exatamente seus horários.

Cada pessoa mantém início e duração de pausa constantes na semana civil. Novas pausas deixam pelo menos uma hora de trabalho antes e depois. O tempo preferencial desde a entrada é priorizado em uma primeira busca sem antecipação; uma segunda busca, se houver déficit, só pode substituir a primeira se reduzir a falta de cobertura medida sem arredondamento. As tentativas compartilham os cinco segundos de busca nativa e o mesmo modelo. A primeira recebe uma sugestão de rotinas semanais com almoços escalonados; a segunda recebe a primeira solução como sugestão de partida. Sugestões não dispensam nenhuma restrição. Uma antecipação aceita é explicada nas decisões. São comparadas soluções encontradas dentro do orçamento, sem prova geral de necessidade da exceção. Contrato, exceções explícitas e preservação do histórico: [decisão de intervalos](rule-parity.md#tempo-antes-do-intervalo-e-proteção-das-pontas--02112026).

## Restrições e cobertura parcial

O modelo impõe exclusividade diária, descanso, saldo semanal e ciclo; candidatos usam diagnóstico canônico para jornada, pausa, disponibilidade, dias/horários, noite, entrada fixa e autorizações. Cobertura insuficiente é uma penalidade no objetivo, não uma obrigação matemática de cobertura integral. Portanto optimal pode coexistir com lacunas. Esse texto corrige a descrição antiga que classificava toda cobertura como restrição obrigatória; o comportamento não mudou.

Atribuições preservadas continuam fixas. CoverageConstraints usa o OR das atribuições por pessoa/bloco; não duplica a capacidade de uma pessoa com turnos sobrepostos. Alocações direcionais de funções compartilham uma capacidade por pessoa, enquanto equipe conta presença. Pausa não cobre, e histórico não é apagado para ocultar conflito.

## Leitura e admissão

ScheduleResultReader mapeia Optimal/Feasible/Unknown/Infeasible/ModelInvalid para os status anteriores. GenerateSchedule confere a fronteira pelo agregado, reavalia o documento proposto e recusa novas violações obrigatórias ou agravamento de conflitos herdados. Falha devolve atribuições originais; invalid/solverInvalid também é reconhecido pelo store. Uma lacuna isolada permite escala parcial.

Cobertura, lacunas, score, contratação e sugestões pertencem à avaliação pura. HiringDemand considera horas-pessoa por semana civil, sem extrapolar semanas parciais nem limitar demanda a 44h; quantidade estimada é limite inferior por carga/simultaneidade. ScheduleExplanation descreve seleções aplicadas. Editar o documento remove a prova de otimização anterior.

Detalhes: [arquitetura](architecture.md), [paridade](rule-parity.md), [ADR 007](decisions/007-optimization-translators-and-admission.md), [testes](testing.md) e [medição](decisions/stage-6-performance.md).
