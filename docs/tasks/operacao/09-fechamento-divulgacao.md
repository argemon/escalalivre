# Task 09 — Fechamento e divulgação

Status: CONCLUÍDA
Dependência: tasks 01–08. Ler [o executor geral](00-EXECUTAR-PROXIMA-TASK.md).

## Objetivo

Guardar a versão entregue à equipe, exportá-la de forma legível e continuar ajustando um novo rascunho sem alterar a escala divulgada.

## Implementação

1. Criar fechamento de período com snapshot independente, ID, número sequencial do documento, início/fim inclusivos e instante de fechamento. Incluir dados necessários para leitura/exportação sem consultar cadastros mutáveis.
2. Versão fechada é imutável pelas operações normais do sistema. Isso não equivale a assinatura digital ou proteção contra edição externa do arquivo.
3. Bloquear fechamento com conflitos obrigatórios detectados. Exigir ciência explícita para lacunas de cobertura, carga incompleta e avisos relevantes; distinguir preferências. Guardar o resumo das pendências reconhecidas, sem motivos médicos.
4. Novas alterações afetam o rascunho. Refazer o fechamento cria nova versão; marcar qual é a versão vigente para o período sem apagar anteriores. Evitar ambiguidade entre períodos sobrepostos por seleção explícita da versão a divulgar.
5. Exportar PDF, imagem PNG e XLSX pela interface, por equipe ou pessoa, reaproveitando os exportadores existentes quando adequados. Exportação de versão fechada usa somente seu snapshot; rascunho deve estar identificado como RASCUNHO.
6. Incluir empresa, período, versão, horários, pausas e legenda. Dividir saída extensa em páginas/imagens legíveis, com nomes consistentes, sem uma imagem gigante ilegível no celular.
7. Exportar células como texto/dados seguros, sem fórmulas originadas de nomes ou campos livres. Excluir motivos privados de ausência, anotações internas, dispensas detalhadas e configurações pessoais desnecessárias.
8. Incluir versões no `.escalalivre`, recuperação e migração idempotente. Definir limites explícitos de quantidade/tamanho compatíveis com cotas atuais; ao atingir limite, orientar arquivamento/exportação, sem apagar versões silenciosamente.
9. Conferir desfazer/refazer e geração: um fechamento nunca é mutado por troca de função, exclusão de pessoa, cópia, ausência ou aplicação do solver. Seleção e visualização de versões ficam claras.

## Pontos de partida

`GlobalHeader.tsx`, `PrintSchedule.tsx`, `lib/printSchedule.ts`, contratos/documentSchema e recuperação; exportadores XLSX/PDF em Infrastructure; limites de arquivo/API existentes. Adicionar exportação de imagem sem dependência pesada injustificada.

## Critérios de aceite

- [x] Fechar gera snapshot consultável com identidade e período claros.
- [x] Conflito obrigatório bloqueia; pendências permitidas exigem reconhecimento explícito.
- [x] Editar cadastro/escala ou excluir funcionário não altera versão anterior.
- [x] Abrir/exportar arquivo preserva versões, sua ordem e conteúdo.
- [x] PDF/PNG/XLSX mostram a mesma versão e omitem informações internas.
- [x] Exportação extensa permanece legível e limites não causam perda silenciosa.
- [x] Cenário final do executor geral concluído com equipe fictícia pequena.

## Validação focada e encerramento

Testar imutabilidade por valor, migração/round-trip, limites e política de fechamento. Conferir conteúdo dos três formatos e inspecionar visualmente um PDF e uma imagem representativos. Usar testes de exportadores existentes; não recriar toda a matriz de regras em cada formato.

Executar uma vez o cenário final de ponta a ponta do executor geral. Antes de integrar o conjunto, conferir CI completa da revisão exata; se não existir evidência válida, executá-la uma vez. Não repetir localmente uma matriz já aprovada para o mesmo código, nem declarar CI aprovada apenas por haver configuração de workflow.

## Fora do escopo

Envio automático por WhatsApp/e-mail, assinatura digital, aprovação autenticada, portal do funcionário, folha ou ponto.

## Registro de execução

- Alterações e decisões: [ADR 028](../../decisions/028-publication-snapshots.md); snapshots sanitizados independentes, ponteiro vigente separado, ciência por categoria, limites e exportação PDF/PNG/XLSX por equipe/pessoa.
- Evidência dos critérios e revisão dos fontes: [validação final](VALIDACAO-FINAL.md), [fontes finais](task-09-fontes.sha256) e [evidências](evidencias-final.sha256). Dez testes frontend/2 fusos e cinco testes C# de fechamento; testes reais de exportador, round-trip HTTP e inspeção PDF/PNG.
- Comandos/resultados reaproveitáveis: lint/build frontend e solução .NET aprovados; matriz completa local uma vez, correções/rechecagens focadas e resultados detalhados no relatório final. Paridade 216 por fuso.
- Limitações/bloqueios/CI: nenhuma task bloqueada. CI remota/integração pendentes, sem commit/push. Arquivo não é assinatura digital; cotas e disponibilidade do serviço de exportação explicitadas no ADR/relatório.
- Cenário final: loja/equipe fictícias, geração real, edição de um segundo/fixação, ausência/substituição, cópia da semana, fechamento/download, desfazer/reabertura e round-trip HTTP aprovados. Saída extensa: 60 turnos, 15 páginas PDF/15 imagens PNG, XLSX conferido.
- Próxima task: nenhuma; encerrar o plano e informar pendências reais.
