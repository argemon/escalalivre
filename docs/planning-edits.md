# Edição direta e histórico da sessão

Clique em turno salvo nas visões diária, semanal ou mensal para editar entrada, saída, pausa e função exercida. O cadastro da pessoa é uma ação separada. A barra Criar turno permite escolher pessoa/data/horários. A visão semanal também oferece criação por célula. Prévia estimada não é tratada como turno salvo. Arrastar no calendário abre uma proposta e reverte a alteração visual até confirmar.

previewPlanning/previewShift validam a estrutura e calculam análise sem alterar o documento. A confirmação exige a mesma revisão completa e recalcula a proposta. Estrutura inválida impede salvar; conflitos de negócio podem permanecer mediante autorização explícita de rascunho. Inativação continua impedindo novas alocações. Não há normalização silenciosa de horários, segundos ou pausas. Edição conserva ID, source, tags e campos não alterados; remoção também exige prévia. A prévia mostra cobertura, carga e conflitos com mensagens operacionais e códigos em detalhes técnicos.

Todas as ações do store que alteram o documento passam por um único registro de histórico: cadastro/configuração, turnos, lote/importação de equipe e aplicação de geração. Cada operação atômica gera uma entrada. Alterar estado transitório não gera entrada. Uma nova edição limpa refazer.

PlanningHistory limita a soma de passado/futuro a 20 snapshots e 8 MiB de conteúdo JSON UTF-8 serializado. É um limite determinístico de dados retidos, não uma medição de heap do navegador. Entradas mais antigas são descartadas; um snapshot individual acima do limite não é retido. Os snapshots são copiados, não persistidos entre sessões e não compartilham mutações externas.

Desfazer/refazer recalcula a análise e deixa o solver idle; limpa seleções e não restaura jobs, tickets ou progresso. A resposta de geração continua exigindo a identidade exata do documento submetido; desfazer não permite aplicar resposta antiga. Abrir arquivo nativo ou restaurar recuperação limpa ambas as pilhas, mesmo com o mesmo ID. Trocar o ID do documento também limpa as pilhas. Limpar tudo conserva a confirmação destrutiva existente.

Validação em 11/11/2026: quatro cenários novos de edição/prévia/histórico aprovados em Cuiabá e Nova York. No segundo fuso passaram também histórico de função, geração e recuperação: 40 testes. Fluxo Edge nas três visões, criação noturna com pausa/segundos, prévia, rascunho, desfazer/refazer aprovado. Lint e build frontend aprovados. Não houve mudança de contrato/backend/solver nesta task; CI remota e integração pendentes.
