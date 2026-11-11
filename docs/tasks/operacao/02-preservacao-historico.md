# Task 02 — Preservação do histórico

Status: CONCLUÍDA
Dependência: task 01. Ler [o executor geral](00-EXECUTAR-PROXIMA-TASK.md).

## Objetivo

Mudar função e inativar pessoas sem reescrever turnos antigos ou apagar seu histórico.

## Implementação

1. Registrar vigência de função por data civil e resolver a função efetiva na data inicial do turno. Mudanças não reescrevem turnos anteriores à vigência.
2. Definir e documentar tratamento dos turnos futuros já salvos: apresentar prévia e confirmação explícita para adequá-los à nova função; versões fechadas, quando existirem, nunca são alteradas.
3. Inativar a partir de data inclusiva: impedir novas alocações com início nessa data ou depois. Turnos noturnos iniciados antes preservam seu pertencimento por data inicial. Sinalizar futuros existentes e oferecer tratamento explícito, sem apagamento automático.
4. Manter inativos pesquisáveis no histórico e ocultáveis na operação. Diferenciar inativação de exclusão definitiva; explicar a remoção de turnos na exclusão e preservar snapshots fechados independentes introduzidos na task 09.
5. Fazer geração, elegibilidade, cobertura e edição consultarem vigências, sem depender apenas da função atual do cadastro. Preservar a função exercida registrada no turno e suas autorizações efetivas.
6. Persistir os campos novos em `.escalalivre` e DTOs. Na migração, manter turnos legados como registrados, sem inventar datas de promoção ou admissão. Sem inativação explícita, manter pessoa ativa.
7. Habilitar mudança de função em lote usando o mesmo comando de vigência e prévia, caso a infraestrutura da task 01 já a suporte.

## Pontos de partida

`EmployeeDrawer.tsx`, `frontend/src/store/scheduleStore.ts` (`upsertEmployee` e `deleteEmployee`), `frontend/src/types/schedule.ts`, `lib/documentLifecycle.ts`, políticas de elegibilidade; contratos e mapeadores em Application; políticas de função em Domain.

## Mudança intencional de contrato

O contrato atual altera a função de todos os turnos ao editar a pessoa. Substituí-lo explicitamente, atualizando `docs/rule-parity.md`, decisão e cenários; não tratar como simples refatoração.

## Critérios de aceite

- [x] Promoção a partir do dia 15 preserva a função dos turnos iniciados até dia 14.
- [x] Inativação mantém consulta histórica e bloqueia novas alocações a partir da vigência.
- [x] Turnos futuros existentes não desaparecem silenciosamente.
- [x] Análise e solver usam o mesmo estado efetivo em cada data.
- [x] Arquivo legado abre sem histórico inventado; round-trip preserva vigências e IDs.

## Validação focada

Cenários compartilhados para limites de vigência, inativação e turno noturno; testes de migração/mapeamento/preservação; adaptador real para elegibilidade na geração. Executar os grupos tocados e a paridade correspondente uma vez no estado final. HTTP focado se o contrato de transporte mudar. Não repetir validação da task 01 sem impacto demonstrado.

## Fora do escopo

Histórico salarial, admissão trabalhista completa, assinatura ou auditoria autenticada.

## Registro de execução

- Alterações e decisões: [ADR 024](../../decisions/024-employment-history.md), campos opcionais e limites/DTOs; políticas de vigência e inativação; prévia individual/lote; futuros adequados apenas explicitamente; geração/edição/cobertura pela função efetiva ou exercida; filtro de inativos e histórico preservado.
- Evidência dos critérios e revisão dos fontes: 11/11/2026, baseline 18fc7f4; [manifesto](task-02-fontes.sha256). Regressão de reescrita falhou antes e passou após correção. Compartilhados: promoção inclusiva dia 15, noite iniciada dia 14, futuro preservado e inativação. Fluxo Edge: node C:/Users/eargemon/Documents/task2-browser.cjs; imagem task2-browser.png na mesma pasta.
- Comandos/resultados reaproveitáveis: dotnet test Analysis.Tests -c Release --filter EmploymentTests/PlanningEditorTests/PlanningAggregateTests/RoleCoverageTests/CoverageCharacterizationTests: 32 aprovados; Adapter.Tests --filter EmploymentGenerationTests/RoleCoverageGenerationTests/DirectionalCoverageTests: 14; node --test frontend/tests de histórico/função/cobertura/lote: 44; paridade-differential: 196 em Cuiabá e NY; SECURITY_BUILD_CONFIGURATION=Release node --test --test-name-pattern="employment vigencies" backend/security.integration.cjs: 1 aprovado; build API, lint e build frontend aprovados. Repetição após ajustes locais registrada nos resultados da sessão.
- Limitações/bloqueios/CI: conclusão local, sem integração ou CI remota. Grupos antigos de reescrita de função mantidos com expectativas revisadas por mudança intencional documentada. Ausência/nulo de pausa são equivalentes no teste HTTP. Snapshots fechados pertencem à task 09.
- Próxima task: [03 — Cobertura](03-cobertura-funcoes.md).
