# Task 05 — Fixar turnos e gerar preservando ajustes

Status: CONCLUÍDA
Dependência: tasks 01–04. Ler [o executor geral](00-EXECUTAR-PROXIMA-TASK.md).

## Objetivo

Regerar um período sem perder turnos combinados e permitir corrigir somente um recorte de datas.

## Implementação

1. Persistir fixação explícita por turno; source manual não significa fixação automática. Exibir e editar o estado no calendário/editor.
2. Geração preserva turnos fixados integralmente: IDs, pessoa, função, entrada, saída, pausa e metadados. Eles participam das restrições, cobertura e consumo de carga.
3. Oferecer geração do período selecionado ou subperíodo de datas, respeitando o limite atual de 1–31 dias. Fora do recorte, preservar turnos e usar seu histórico.
4. Manter propriedade pela data inicial: turno iniciado dentro do recorte pertence inteiro ao recorte mesmo terminando fora; fixação continua prevalecendo.
5. Separar obtenção da proposta de sua aplicação. Mostrar inclusões, alterações, remoções, cobertura e conflitos antes de confirmar; nunca aplicar resposta obsoleta.
6. Compromissos fixados incompatíveis não são relaxados automaticamente. Se impedirem solução admissível, apresentar diagnóstico e preservar o original. Conflitos herdados mantêm o contrato de admissão documentado, sem agravamento silencioso.
7. Cancelamento, falha, timeout sem solução admissível e rejeição da prévia preservam o documento. Confirmação é atômica e desfazível, mantendo cópia recuperável.
8. Não aumentar orçamento de solver/worker, nem remover isolamento/fila para implementar o recurso.

## Pontos de partida

`SolverPanel.tsx`, `store/generationStore.ts`, `store/scheduleStore.ts`, `lib/scheduleWindow.ts`; GenerateSchedule/GenerationConformance em Application; FixedAssignment e geração de candidatos/modelo em Infrastructure.

## Critérios de aceite

- [x] Fixar sábado e gerar a semana mantém o turno exato.
- [x] Geração de quarta a sexta preserva demais datas, turnos noturnos conforme pertencimento e todo fixado.
- [x] Fixados restringem descanso, carga e cobertura dos candidatos novos.
- [x] Proposta pode ser rejeitada sem mudanças e não é aplicada se o documento foi editado.
- [x] Falha/cancelamento preserva o original; aplicação aceita é desfazível.

## Validação focada

Testar preservação por valor, recorte/noturno, fixados inviáveis, prévia e resposta obsoleta. Rodar adaptador real e integração de geração/cancelamento afetada uma vez no estado final. Não repetir toda a suíte de fila/retenção se esses mecanismos não mudaram.

## Fora do escopo

Geração por minutos arbitrários, alteração automática de contratos e otimização de múltiplas lojas.

## Registro de execução

- Alterações e decisões: [ADR 026](../../decisions/026-pinned-generation-proposals.md); fixação persistida/editor/cadeado; solver e agregado retêm compromissos; geração por recorte com proposta, checkpoint e aplicação desfazível.
- Evidência dos critérios e revisão dos fontes: 11/11/2026; [manifesto](task-05-fontes.sha256). Regressão de substituição perdeu pin antes da correção. Quatro cenários compartilhados incluem sábado interno, noite/histórico bilateral e inviabilidades. Fluxo node C:/Users/eargemon/Documents/task5-browser.cjs com API real; imagem task5-browser.png.
- Comandos/resultados reaproveitáveis: 26 Analysis.Tests relacionados; 59 Adapter.Tests de pin/preservação/feriado/intervalo e depois PinnedGenerationTests 4/4 com sábado adicional; 16 testes frontend em NY, novos casos também em Cuiabá; checkpoint focado 1/1; HTTP pin+cancelamento 2/2 e pin com sábado adicional 1/1; paridade --case de 3 em Cuiabá e 4 em NY; lint/build frontend e build API aprovados.
- Limitações/bloqueios/CI: conclusão local, sem CI remota/integração. Propostas vivem em memória e são invalidadas por qualquer edição. Checkpoint obrigatório precede a aplicação. Testes antigos mantidos com fixtures de GUID/status admissível válidos e nova expectativa explícita de confirmação antes de aplicar.
- Próxima task: [06 — Ausências](06-ausencias-substituicoes.md).
