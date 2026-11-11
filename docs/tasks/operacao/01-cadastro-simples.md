# Task 01 — Cadastro simples e rápido

Status: CONCLUÍDA
Dependência: nenhuma. Ler primeiro [o executor geral](00-EXECUTAR-PROXIMA-TASK.md).

## Objetivo

Configurar uma equipe com jornadas semelhantes sem preencher repetidamente todos os campos, mantendo acesso às opções avançadas.

## Implementação

1. Reutilizar os modelos existentes de 5x2 e 6x1 como ponto de partida, com resumo dos dias, horas, intervalo e limites antes de salvar. Modelo não implica certificação jurídica.
2. Separar campos essenciais e avançados; preservar valores avançados ao recolher a seção. Mostrar resumo de exceções ativas.
3. Duplicar funcionário com novo ID e nome obrigatório. Copiar jornada/permissões/preferências recorrentes, mas não turnos, afastamentos, bloqueios datados, histórico, datas de inativação ou versões fechadas. Na criação do plano alguns desses campos ainda não existem; aplicar a regra quando forem introduzidos.
4. Selecionar várias pessoas e aplicar somente campos explicitamente escolhidos. Prévia deve mostrar pessoas afetadas, diferenças e erros; confirmar tudo atomicamente. Não atualizar turnos por efeito colateral. A mudança de função em lote fica para após o contrato de histórico da task 02.
5. Exibir prioridade baixa/média/alta para novas preferências, com mapeamento explícito e documentado para pesos. Pesos legados não equivalentes continuam preservados e identificados como personalizados; não arredondar silenciosamente.
6. Importar equipe por `.xlsx` e `.csv`, com modelo, limites de tamanho/linhas e prévia por linha. Aceitar nome, função cadastrada e modelo/jornada compatível; documentar colunas e separador. Nome igual indica possível duplicação, não identidade garantida. Não sobrescrever cadastro existente automaticamente. Erros bloqueiam confirmação até corrigir ou excluir explicitamente as linhas problemáticas.
7. Reutilizar parser disponível ou justificar dependência pequena compatível com execução local. Dados importados são tratados como dados, sem executar fórmulas.

## Pontos de partida

`frontend/src/components/EmployeeDrawer.tsx`, `EmployeeScheduleEditor.tsx`, `WeeklyWorkPlanEditor.tsx`, `OperationalSidebar.tsx`; `frontend/src/lib/regimes.ts`, `documentSchema.ts`; `frontend/src/store/scheduleStore.ts`. Conferir se esses caminhos e recursos continuam atuais.

## Critérios de aceite

- [x] Novo funcionário criado por modelo com configuração visível e editável.
- [x] Duplicação cria identidade própria, sem carregar eventos pessoais datados.
- [x] Aplicação em lote tem prévia e não altera turnos existentes.
- [x] Preferências antigas mantêm seus pesos após abrir/salvar/exportar.
- [x] Planilha válida importa após conferência; erro, cancelamento ou duplicação não produz importação parcial silenciosa.
- [x] Formulário básico pode ser usado sem percorrer todas as opções avançadas.

## Validação focada

Testar parsing, limites, duplicação, preservação e atomicidade; conferir arquivo legado com pesos personalizados. Fazer um fluxo manual curto de cadastrar, duplicar e importar. Lint/build frontend uma vez no estado final. Backend apenas se seus contratos forem efetivamente alterados; não rodar solver ou matriz HTTP por reorganização visual.

## Fora do escopo

Importar escalas de terceiros, sincronização com folha, cadastro remoto, novas regras legais ou regimes não suportados.

## Registro de execução

- Alterações e decisões: modelos existentes mantidos, resumo e opções avançadas recolhíveis; duplicação por allowlist, lote com campos explícitos/prévia/validação atômica e confirmação obsoleta recusada; prioridades 1/5/10 e valores personalizados preservados; importação CSV/XLSX nativa limitada, prévia por linha e confirmação de homônimos. Contrato: [cadastro/importação](../../team-import.md).
- Evidência dos critérios e revisão dos fontes: 11/11/2026, baseline 18fc7f479fde4f52b1ffa89a1816b814c9f37179; manifesto [SHA-256](task-01-fontes.sha256). Fluxo no Edge headless: cadastrar 5x2, duplicar com novo nome, importar CSV, verificar três IDs novos e turnos intactos, sem erros de browser. XLSX real armazenado/deflate lido no Edge, fórmulas recusadas. Imagem local: C:/Users/eargemon/Documents/task1-browser.png.
- Comandos/resultados reaproveitáveis: node --test frontend/tests/team-operations.test.cjs frontend/tests/employee-role-change.test.cjs frontend/tests/weekly-work-plan.test.cjs: 28/28; npm --prefix frontend run lint: aprovado; npm --prefix frontend run build: aprovado. Fluxos locais: node C:/Users/eargemon/Documents/task1-browser.cjs e task1-xlsx.cjs: aprovados.
- Limitações/bloqueios/CI: conclusão local; CI e integração pendentes. Build com avisos do Zod e tamanho de chunk. Sem alterações de regra C#/solver ou formato nativo. Leitor XLSX requer navegador com DecompressionStream deflate-raw (verificado no Edge instalado).
- Próxima task: [02 — Histórico](02-preservacao-historico.md).
