# Task 08 — Resumo operacional com ações

Status: CONCLUÍDA
Dependência: tasks 01–07. Ler [o executor geral](00-EXECUTAR-PROXIMA-TASK.md).

## Objetivo

Transformar diagnósticos existentes em uma lista curta, priorizada e acionável para o gerente.

## Implementação

1. Reutilizar agrupamentos existentes de lacunas e evitar duplicação. Unir somente blocos consecutivos compatíveis em função, déficit e contexto; manter diferenças relevantes e transições de data claras.
2. Separar conflitos obrigatórios, falta de pessoas, falta de carga contratada e preferências/pontos de atenção. Não usar percentual de cobertura como sinal único de escala válida.
3. Exibir mensagem operacional, pessoa/função, data, faixa e quantidade. Mostrar código técnico em detalhe secundário.
4. Criar contadores/filtros por categoria, dia e função; manter contagem de grupos e quantidade de ocorrências claramente identificadas.
5. Ações contextuais abrem a data/pessoa/turno corretos: localizar na escala, editar turno, procurar substituto e rever demanda de cobertura. Reutilizar os fluxos das tasks anteriores.
6. Ação para lacuna sem turno deve abrir alocação de pessoa elegível ou edição da demanda, sem fingir que há turno a substituir. Qualquer redução da necessidade de cobertura é decisão explícita do gestor.
7. Reavaliar candidatos e diagnósticos sobre o documento atual. Se não houver solução elegível, explicar os impedimentos sem prometer resolução automática.
8. Garantir navegação por teclado, foco ao abrir/fechar diálogos e indicadores que não dependam somente de cor.

## Pontos de partida

`SolverPanel.tsx`, `OperationalTimeline.tsx`, `HiringSuggestionCard.tsx`, `WorkloadSummaryCard.tsx`; agrupamentos em `lib`, análise e comandos de navegação/seleção.

## Critérios de aceite

- [x] Lacuna contínua aparece de forma agrupada sem esconder mudança de déficit ou dia.
- [x] Cobertura, carga e conflito obrigatório têm categorias distintas.
- [x] Alerta leva ao contexto certo e permite iniciar correção sem procurar cadastros manualmente.
- [x] Alterar escala atualiza resumo e não deixa ações apoiadas em candidatos obsoletos.
- [x] Sem solução, mensagem informa impedimento; nenhuma demanda é reduzida automaticamente.

## Validação focada

Testar agrupamento somente se a lógica mudar e a ligação entre alerta/ação/contexto. Verificar manualmente teclado e mensagens em conjunto representativo de alertas. Lint/build frontend; reutilizar testes existentes das regras, sem rodar toda a suíte backend por mudança de apresentação.

## Fora do escopo

Dashboard financeiro, previsão de demanda e recomendações por IA generativa.

## Registro de execução

- Alterações e decisões: [resumo e ações](../../operational-summary.md); agrupamento compatível por dia/contexto, categorias/contadores/filtros, navegação e ações com validação atual, foco e teclado.
- Evidência dos critérios e revisão dos fontes: 11/11/2026; [manifesto](task-08-fontes.sha256). Contexto de alerta/turno, grupo/ocorrências, datas intermediárias, busca sem candidato e demanda inalterada cobertos. Fluxo node C:/Users/eargemon/Documents/task8-browser.cjs, imagem task8-browser.png; Tab/Escape e restauração de foco aprovados.
- Comandos/resultados reaproveitáveis: operational-summary.test.cjs: 5; junto de interval-timing/minimum-interval/absence-operations: 35 aprovados; fluxo Edge, lint/build frontend aprovados.
- Limitações/bloqueios/CI: conclusão local e CI/integração pendentes. Busca de alocação é local e não exaustiva, sem prometer resolução automática. Grupos de falta de pessoas representam blocos diários; uma transição de data pode representar trechos da mesma origem em dias distintos. Nenhuma demanda é reduzida automaticamente.
- Próxima task: [09 — Fechamento](09-fechamento-divulgacao.md).
