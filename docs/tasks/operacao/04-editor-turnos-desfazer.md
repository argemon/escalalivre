# Task 04 — Edição direta de turnos e desfazer

Status: CONCLUÍDA
Dependência: tasks 01–03. Ler [o executor geral](00-EXECUTAR-PROXIMA-TASK.md).

## Objetivo

Editar o turno pelo calendário e recuperar uma alteração equivocada sem entrar no cadastro completo do funcionário.

## Implementação

1. Clique em turno salvo abre editor com entrada, saída, intervalo, função exercida e ações de remover/fixar quando disponíveis. Editar funcionário é ação separada. Prévias estimadas são identificadas e não tratadas como turnos salvos.
2. Permitir criar turno diretamente para pessoa/data. Usar operações existentes e preservar IDs na edição, source, tags e metadados não modificados.
3. Mostrar impacto em cobertura, carga e conflitos antes de confirmar. Reavaliar se o documento mudou durante a prévia.
4. Separar erro estrutural, que impede gravação, de conflito de negócio, que pode ser mantido explicitamente em rascunho com diagnóstico. Não corrigir horários silenciosamente.
5. Introduzir desfazer/refazer limitado por quantidade e tamanho em memória, centralizado nas operações do planejamento, sem framework genérico. Operações em lote constituem uma entrada; nova edição limpa a pilha de refazer.
6. Cobrir cadastro/configuração, turnos, lote/importação e aplicação de geração quando alterarem o planejamento. Restauração de arquivo e recuperação devem substituir ou limpar as pilhas de forma documentada, sem misturar documentos. Limpar tudo mantém confirmação destrutiva própria.
7. Desfazer/refazer restaura estado e recalcula análise; nunca restaura job ativo, ticket, seleção transitória ou progresso do solver. Preservar proteção contra resposta de geração obsoleta.
8. Exibir mensagens em linguagem de operação; códigos continuam disponíveis nos detalhes técnicos.

## Pontos de partida

`ScheduleCalendar.tsx`, `WeeklySchedule.tsx`, `OperationalTimeline.tsx`, `EmployeeShiftEditor.tsx`, `EmployeeDrawer.tsx`; store e `lib/documentLifecycle.ts`; comandos de planejamento em Domain/Application.

## Critérios de aceite

- [x] Criar, editar e remover turno sem editar o cadastro da pessoa.
- [x] Editar turno noturno e pausa corretamente, sem perder segundos/metadados.
- [x] Prévia não altera o documento e não confirma sobre revisão obsoleta.
- [x] Desfazer/refazer operação individual e lote restaura o resultado esperado.
- [x] Histórico em memória é limitado e não ressuscita jobs nem mistura documentos.
- [x] Conflitos permanecem visíveis e distinguíveis de erros estruturais.

## Validação focada

Testes das operações, atomicidade, pilhas, obsolescência e preservação; cenários de data/pausa afetados em dois fusos. Conferir um fluxo manual nas visões diária, semanal e mensal sem repetir os mesmos testes de regra em cada tela. Lint/build frontend; testes backend apenas para mudanças reais de comandos/contratos.

## Fora do escopo

Auditoria autenticada, histórico ilimitado e persistência de todas as ações entre sessões.

## Registro de execução

- Alterações e decisões: [contrato de edição/histórico](../../planning-edits.md); editor por turno nas três visões, criação por pessoa/data, arraste com proposta, prévia imutável e obsolescência; histórico centralizado por documento.
- Evidência dos critérios e revisão dos fontes: 11/11/2026; baseline 18fc7f4; [manifesto](task-04-fontes.sha256). Fluxo node C:/Users/eargemon/Documents/task4-browser.cjs, imagem task4-browser.png: três visões, criação noturna, segundos/pausa, rascunho, desfazer/refazer. Testes verificam edição/remoção, ID/source/tags, atomicidade, limites e isolamento do histórico.
- Comandos/resultados reaproveitáveis: node --test frontend/tests/planning-edits.test.cjs: 4 aprovados em Cuiabá; com TZ=America/New_York, planning-edits/history-preservation/generation-store/recovery: 40 aprovados. npm --prefix frontend run lint e build aprovados; orientação mensal ajustada depois apenas no texto.
- Limitações/bloqueios/CI: conclusão local e CI pendente. Histórico limitado a 20 estados e 8 MiB de JSON serializado, somente em memória; não mede heap. Arquivo nativo/recuperação e troca de documento limpam pilhas. Backend/solver não alterados nesta task. Fixação será habilitada na task 05.
- Próxima task: [05 — Fixar e regenerar](05-fixar-e-regenerar.md).
