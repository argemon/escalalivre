# Task 07 — Reutilização da escala e trocas

Status: CONCLUÍDA
Dependência: tasks 01–06. Ler [o executor geral](00-EXECUTAR-PROXIMA-TASK.md).

## Objetivo

Copiar uma semana útil e trocar turnos entre pessoas com prévia e validação da operação completa.

## Implementação

1. Selecionar semana civil de origem, semana de destino e pessoas; copiar apenas turnos salvos, mantendo correspondência dos dias da semana.
2. Gerar IDs novos, deslocar entrada/saída/pausa pelo mesmo número de dias civis e preservar duração/segundos. Não copiar ausências nem versões fechadas. Por padrão não copiar fixação; oferecer opção explícita e mostrar no resumo.
3. Conferir função vigente, autorização, inativação, feriados, afastamentos e histórico no destino. Não deslocar datas usando milissegundos que dependam de fuso/DST.
4. Se houver turnos no destino, mostrar colisões; permitir cancelar, pular explicitamente os itens ou substituir os selecionados. Fixados exigem desafixação explícita anterior, sem sobrescrita silenciosa.
5. Exibir prévia completa; pendências de negócio podem permanecer no rascunho apenas com reconhecimento explícito. Não apresentar cópia conflitante como pronta.
6. Troca seleciona dois turnos e permuta seus responsáveis, mantendo horários/pausas. Resolver função exercida e autorizações de cada destino explicitamente na prévia.
7. Para troca, avaliar os dois funcionários e a escala resultante; bloquear novas violações obrigatórias ou agravamento das existentes. Manter regra documentada para conflitos herdados, sem usar um conflito antigo como autorização genérica.
8. Aplicar cópia ou troca como operação atômica/desfazível; prévia obsoleta precisa de nova avaliação.

## Pontos de partida

`WeeklySchedule.tsx`, editor de turnos, operações/pilhas da task 04; políticas de datas civis, elegibilidade, feriados e ausências. Reutilizar análise completa sem criar outro motor de regras.

## Critérios de aceite

- [x] Copiar semana vazia/destino sem conflito produz turnos equivalentes com IDs próprios.
- [x] Turno noturno e intervalo mantêm horários civis e duração no destino.
- [x] Feriado, afastamento, promoção e inativação são avaliados no destino.
- [x] Colisões/fixados não são sobrescritos silenciosamente.
- [x] Troca inválida não aplica metade da operação; troca válida é desfazível.

## Validação focada

Testes de deslocamento civil em dois fusos, colisão/fixação, mudança de vigência e troca com conflito em apenas um dos lados. Um fluxo funcional de cópia e um de troca. Não rodar solver para operações que usam somente análise, salvo mudança efetiva de integração.

## Fora do escopo

Solicitação de troca pelo funcionário, notificações e aprovação multiusuário.

## Registro de execução

- Alterações e decisões: [contrato de reutilização](../../schedule-reuse.md); cópia civil com seleção de pessoas/IDs novos, pins opcionais, colisões explícitas e destino selecionado; troca com análise inteira e regra conservadora para conflitos herdados.
- Evidência dos critérios e revisão dos fontes: 11/11/2026; [manifesto](task-07-fontes.sha256). Casos de DST/noite/pausa, destino com promoção/ausência/feriado/inativação, pins e colisões, troca inválida de um lado e desfazer. Fluxo node C:/Users/eargemon/Documents/task7-browser.cjs; imagem task7-browser.png.
- Comandos/resultados reaproveitáveis: node --test frontend/tests/schedule-reuse.test.cjs: 6 em cada fuso (Cuiabá/NY); com planning-edits.test.cjs: 10 aprovados; fluxo Edge, lint e build frontend aprovados.
- Limitações/bloqueios/CI: conclusão local e CI/integração pendentes. Troca exige zero erros obrigatórios para os dois participantes, inclusive preexistentes; conflitos de terceiros não são corrigidos por essa operação. Cópia seleciona o período de destino e preserva demais datas como histórico. Não houve alteração de backend/solver.
- Próxima task: [08 — Resumo](08-resumo-operacional.md).
