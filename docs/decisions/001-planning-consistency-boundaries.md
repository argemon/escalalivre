# ADR 001 — Limites de consistência do planejamento

Data: 23/10/2026. Estado: implementado progressivamente na etapa 3 em 26/10/2026; projeções legadas preservadas para a transição.

## Contexto anterior à implementação

[ScheduleModels.cs](../../backend/EscalaLivre.Domain/Scheduling/ScheduleModels.cs) representa o documento por records e coleções recebidas do chamador. Não há agregado com operações protegidas. [ScheduleWindow.Replace](../../backend/EscalaLivre.Domain/Scheduling/ScheduleWindow.cs) substitui pela data inicial; [PreservedShiftsTests](../../backend/EscalaLivre.Adapter.Tests/PreservedShiftsTests.cs) comprova preservação do histórico e propriedade de turnos noturnos.

## Decisão

O documento portátil continua sendo envelope de arquivo/API com identidade e versão, sem se tornar automaticamente um agregado gigante. O agregado PlanningSchedule controla atribuir, substituir, mover e remover turnos por seus IDs. A identidade do planejamento permanece associada ao documento: o contrato atual só possui document.id; nenhuma nova identidade será serializada nesta etapa. Mantém o conjunto completo de atribuições, inclusive histórico externo; o período selecionado limita substituição, não a informação disponível para avaliação.

As operações protegem identidade única, referências necessárias, estrutura temporal e substituição explícita. Coleções serão copiadas defensivamente ou imutáveis. Não basta expor IReadOnlyList sobre a lista recebida. A atomicidade exigida é a mudança explícita de atribuições, inclusive turno e pausa juntos e o conjunto substituído na geração.

Cadastro de pessoas e configuração de empresa são limites distintos por motivo de mudança; o documento mantém suas referências. Não se propõe repositório, banco ou transação distribuída. Mudança de configuração conserva horários e solicita nova avaliação. A mudança explícita da função da pessoa conserva o comportamento existente de atualizar a função dos seus turnos; a coordenação será do caso de uso, sem ajuste implícito de horários.

Descanso, semana, ciclo e cobertura avaliam conjuntos e configuração por políticas puras. São conformidade da escala, não condições para abrir um documento. Não se garante elegibilidade global no construtor de um turno.

## Consequências

Introduzir objetos internos e mapeadores progressivamente na etapa 3. Manter schema e round-trip; exigir testes de coleções protegidas, referências e operações, além dos testes existentes de período, troca de função e recuperação. O limite exato das classes depende das operações extraídas na etapa 2; esta decisão define a consistência necessária, sem exigir uma hierarquia antecipada.

## Implementação em 26/10/2026

PlanningSchedule mantém identidade, período, referências de proprietários e atribuições protegidas, com operações atômicas; PlanningSettings separa configuração e pessoas. PlanningDocumentMapping conserva o envelope em Application e PlanningEditor coordena mudanças entre os dois limites. GenerateSchedule aplica a seleção por ReplacePeriod. Coleções dos novos tipos são imutáveis e não expõem o armazenamento por wrappers de sincronização. Os antigos records continuam projeções de leitura, sem promessa de invariantes por seus construtores legados. [ADR 005](005-validated-planning-and-transport.md) e [evidências](stage-3-protected-planning.md).

Seguimento de consolidação: [ADR 008](008-final-boundaries-and-validation.md) e [revisão final](stage-6-final-review.md). Nomes/estados anteriores neste registro são históricos.
