# Task 06 — Ausências e substituições

Status: CONCLUÍDA
Dependência: tasks 01–05. Ler [o executor geral](00-EXECUTAR-PROXIMA-TASK.md).

## Objetivo

Registrar uma ausência em um único fluxo e encontrar substitutos possíveis para os turnos atingidos.

## Implementação

1. Oferecer férias, atestado, licença e indisponibilidade como categorias, com datas inclusivas ou janela parcial explicitamente indicada. Converter para janelas civis sem perder o último dia.
2. Na mesma tela, mostrar bloqueio de disponibilidade e tratamento de carga: sem dispensa ou quantidade explicitamente dispensada, limitada à carga prevista. Categoria não cria crédito automaticamente nem substitui decisão do RH.
3. Usar evento com identidade própria e origem dos efeitos derivados, para editar/remover sem duplicar dispensas ou apagar restrições cadastradas por outro motivo. Definir sobreposição de ausências sem duplicar crédito.
4. Legado com `contractLeaves` e restrições continua preservado; não presumir que eventos antigos independentes representam uma mesma ausência.
5. Listar turnos atingidos, inclusive noturnos que apenas cruzem o afastamento. Oferecer manter com conflito, remover ou substituir explicitamente. Não desfazer fixações nem remover turnos sem confirmação.
6. Buscar candidatos por função vigente/autorizações, atividade, disponibilidade, outros turnos, descanso, jornada, extras e cobertura exclusiva/acumulável. Reavaliar a proposta inteira, não apenas o turno isolado.
7. Mostrar por que o candidato é elegível e o impacto previsto; não confundir elegibilidade com garantia de cobertura total. Se nenhum for elegível, explicar impedimentos úteis.
8. Aplicar ausência e tratamentos escolhidos atomicamente, com prévia atualizada e desfazer. Preservar versões fechadas quando disponíveis.

## Pontos de partida

`EmployeeDrawer.tsx` (dispensas/bloqueios), `types/schedule.ts`, políticas de disponibilidade/carga/elegibilidade; análise de documentos e comandos transacionais da task 04.

## Critérios de aceite

- [x] Ausência de vários dias pode ser lançada uma vez com efeitos explícitos sobre carga e disponibilidade.
- [x] Editar/remover ausência não duplica crédito nem remove bloqueios independentes.
- [x] Turnos que cruzam ausência parcial/noturna são identificados.
- [x] Sugestões respeitam vigência, capacidade, fixações e demais restrições aplicáveis.
- [x] Sem candidato, documento é preservado e o motivo é compreensível.
- [x] Confirmar gera uma operação desfazível; cancelar não altera nada.

## Validação focada

Cenários compartilhados de bloqueio/dispensa, sobreposição e noturno; testes transacionais e de candidatos que parecem livres mas violam descanso ou teto semanal. Reutilizar análise existente. Adaptador apenas se geração/contrato for alterado; integração focada quando novos campos cruzarem API.

## Fora do escopo

Anexos médicos, CID, folha, descontos salariais e aprovação jurídica automática.

## Registro de execução

- Alterações e decisões: [ADR 027](../../decisions/027-absence-events-and-substitution.md); evento identificado, janela inclusiva/parcial, bloqueio e crédito explícitos, tratamento por turno, candidatos por análise inteira, aplicação atômica/desfazível.
- Evidência dos critérios e revisão dos fontes: 11/11/2026; [manifesto](task-06-fontes.sha256). Regressão noturna reproduzida antes da implementação. Sete cenários compartilhados; candidatos recusados por descanso, teto semanal, bloqueios e inativação. Fluxo node C:/Users/eargemon/Documents/task6-browser.cjs, imagem task6-browser.png.
- Comandos/resultados reaproveitáveis: Analysis.Tests AbsenceTests/ContractWorkTests: 40; Adapter.Tests AbsenceGenerationTests/ContractGenerationTests: 24; node --test absence-operations.test.cjs: 10 por fuso; paridade --case com sete cenários em Cuiabá e NY; HTTP --test-name-pattern="absence events": 1 aprovado; lint/build frontend e build API aprovados.
- Limitações/bloqueios/CI: conclusão local; CI/integração pendentes. Sugestão não garante cobertura total; candidatos com conflitos obrigatórios preexistentes são excluídos conservadoramente. Categoria não concede crédito nem substitui decisão do responsável. Fixados exigem desafixação explícita antes de remover/substituir. Snapshots fechados pertencem à task 09.
- Próxima task: [07 — Reutilização](07-reutilizacao-trocas.md).
