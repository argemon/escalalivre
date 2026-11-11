# Task 03 — Cobertura confiável por função

Status: CONCLUÍDA
Dependência: tasks 01–02. Ler [o executor geral](00-EXECUTAR-PROXIMA-TASK.md).

## Objetivo

Diferenciar autorização para substituir uma função de capacidade de atender várias funções simultaneamente.

## Implementação

1. Definir contrato explícito de cobertura exclusiva/substituição e acumulação autorizada. Novas configurações usam substituição exclusiva como padrão; documentos legados mantêm sua semântica simultânea até revisão explícita.
2. No modo exclusivo, distribuir a capacidade da pessoa entre funções por bloco temporal; ela não atende duas exigências independentes simultaneamente. Usar alocação determinística que não dependa da ordem de cadastro e não desperdice substituições disponíveis.
3. Documentar a combinação de permissões herdadas e individuais e evitar que uma autorização de acumulação faça outras permissões virarem acumulação silenciosamente. Representar explicitamente os conjuntos/relações permitidos, usando o modelo mais simples que cumpra essa regra.
4. Cobertura geral da equipe conta cada pessoa uma vez, mesmo que também cubra uma função. Pausas fornecem cobertura zero.
5. Utilizar função/vigência da task 02. Expor no resultado a contribuição de cada pessoa e as lacunas, distinguindo autorização de alocação efetiva.
6. Implementar a mesma semântica em Domain, tradução para OR-Tools e análise TS; explicar o comportamento na interface e no arquivo exportado.
7. Atualizar contrato de paridade, migrações, decisão e exemplos. Não alterar silenciosamente os pesos gerais do otimizador nem ampliar seus limites.

## Pontos de partida

`frontend/src/lib/coverageAllocation.ts`, `coverageRules.ts`, `components/RolesEditor.tsx`, `EmployeeDrawer.tsx`; `RoleCoveragePolicy`, cobertura/análise em Domain e família de restrições de cobertura em Infrastructure. Consultar a decisão 022 sobre autorizações.

## Critérios de aceite

- [x] Um substituto exclusivo não elimina sozinho duas demandas simultâneas.
- [x] Com duas pessoas e permissões cruzadas, a alocação encontra a cobertura possível independentemente da ordem dos cadastros.
- [x] Acumulação expressamente autorizada funciona sem duplicar a contagem na equipe.
- [x] Pausas, vigências e limites temporais são respeitados.
- [x] Análise TS, C# e resultado gerado concordam sobre contribuições e lacunas.
- [x] Legado conserva resultados anteriores até conversão confirmada com prévia.

## Validação focada

Usar os mesmos cenários pequenos em análise C#/TS e adaptador real: exclusivo, acumulável, misto, pausa, ordem permutada e legado. Rodar paridade e integração afetadas uma vez no estado final. Benchmark somente se houver indício concreto de regressão de complexidade; não executar medição geral por rotina.

## Fora do escopo

Previsão de vendas, produtividade individual ou dimensionamento por faturamento.

## Registro de execução

- Alterações e decisões: [ADR 025](../../decisions/025-exclusive-role-allocation.md); modo exclusivo em documentos novos, legado mantido, conversão confirmada; matching determinístico C#/TS, grupo ativo explícito, contribuições por pessoa e tradução de capacidade no solver.
- Evidência dos critérios e revisão dos fontes: 11/11/2026, baseline 18fc7f4; [manifesto](task-03-fontes.sha256). Regressão reproduzida antes da alteração. Nove cenários compartilhados com permutação e fronteiras de pausa/vigência. Edge: node C:/Users/eargemon/Documents/task3-browser.cjs, imagem task3-browser.png; prévia, cancelamento, conversão e grupo sem alterar turnos.
- Comandos/resultados reaproveitáveis: Analysis.Tests filtro ExclusiveCoverageTests/RoleCoverageTests/58 respostas históricas: 81; Adapter.Tests filtro ExclusiveCoverageGenerationTests/RoleCoverageGenerationTests/EmploymentGenerationTests: 11; node --test dos grupos exclusive/role/simultaneous/history: 40; testes extras de digest/paridade executados; node tools/parity-differential.cjs: 205; HTTP --test-name-pattern="exclusive role allocation": 1; build API, lint/build frontend aprovados.
- Limitações/bloqueios/CI: conclusão local; CI e integração pendentes. Grupo é alocação ativa declarada, não otimizador de múltiplos grupos alternativos; essa semântica é explícita no cadastro. Campos opcionais mantêm ausência legada. Resultados legados mantêm o formato anterior, identificados no painel.
- Próxima task: [04 — Editor e desfazer](04-editor-turnos-desfazer.md).
