# 028 — Fechamento independente e divulgação

Data: 11/11/2026. Task 09. Baseline 18fc7f4; trabalho local sem commit/push.

## Decisão

Cada fechamento cria uma Publication com UUID, número sequencial no documento, período civil inclusivo e instante UTC com milissegundos. Guarda somente empresa/fuso, nomes/funções, turnos e pausas com segundos e contagens de pendências reconhecidas. Não guarda categorias/motivos de ausência, dispensas, source, tags, preferências ou configurações pessoais. Os turnos pertencem ao período pela data inicial, inclusive quando terminam no dia seguinte, conforme o contrato de edição/geração. Histórico fora do período continua no rascunho.

PublicationPolicy no Domain define validação estrutural e bloqueio de fechamento por conflitos obrigatórios/ciência incompleta; TS espelha a decisão para operação local. Cinco casos compartilhados em shared/publication-closure-scenarios.json incluem preferências reconhecidas separadamente de avisos. Outros quatro em shared/publication-preference-scenarios.json conferem folga preferida e pausa antecipada, contadas pela data civil inicial sem torná-las conflitos obrigatórios. A revisão reanalisa o documento completo, incluindo conflitos obrigatórios históricos. Pendências são resumidas em cobertura, carga, avisos e preferências; nenhuma mensagem privada é materializada no snapshot.

A coleção publications é um arquivo imutável pelas operações normais. publicationSelections é um ponteiro separado por período exato. Períodos sobrepostos têm escolhas independentes; o usuário escolhe explicitamente a versão a divulgar. Refazer fechamento cria outra versão. Edição/remoção de pessoas, ausência, cópia, geração, undo e redo conservam o arquivo atual; fechamento e mudança do ponteiro não entram no histórico do rascunho. Importação/recuperação substituem o documento inteiro explicitamente e limpam esse histórico. Coleções são copiadas nos mapeadores C# e congeladas no estado TS. Não é assinatura digital nem proteção contra edição externa do JSON.

## Persistência e cotas

Campos opcionais preservam documentos antigos sem inventar fechamentos. As migrações não normalizam nem reescrevem horários de versões fechadas. DTOs omitem pausas ausentes também no HTTP, mantendo o conteúdo igual ao arquivo/browser. Limites: 10 versões ordenadas sem buracos, 200 pessoas e 1.000 turnos por versão, 256 KiB por snapshot e 512 KiB no conjunto serializado compacto em UTF-8, além do limite nativo de 1 MiB e cotas existentes de recuperação. A confirmação valida o arquivo nativo exato antes de persistir. Nenhuma versão é descartada para liberar espaço; a orientação é exportar/arquivar e iniciar outro documento. Limpar/importar deixam explícito que substituem versões. Falha de armazenamento mantém o modo de recuperação existente.

## Saídas

O painel Fechar e divulgar permite rascunho ou versão explícita, equipe ou pessoa. Rascunho leva RASCUNHO. PDF e XLSX reaproveitam os adaptadores existentes, alimentados por um documento neutro construído exclusivamente do snapshot escolhido. A empresa/cadastro correntes não participam da exportação de uma versão fechada. PDF A4 paisagem pagina e repete cabeçalhos; XLSX usa inlineStr, sem fórmulas derivadas de texto livre. A saída pública omite Origem. Horários/pausas mantêm segundos, inclusive noite. PNG usa Canvas e páginas de 1000×1600 em ZIP sem dependência nova, com limite de 200 páginas/64 MiB; erro não baixa um arquivo parcial. Todas as saídas incluem empresa, período, identificação e legenda.

## Validação

Resultados finais e limitações em [validação geral](../tasks/operacao/VALIDACAO-FINAL.md). Testes cobrem decisão compartilhada, clone, round-trip, ausência de campos privados, limites por contagem/bytes, apontamento de vigente e preservação no histórico. Exportadores reais conferem texto seguro/XLSX e PDF. O cenário final usa loja e equipe fictícias, serviço/worker real, regras/store de produção e interface Edge para fechamento/download/undo/reabertura; não afirma repetir manualmente todos os fluxos já verificados nas tasks 01–08. Há inspeção visual PDF/PNG e conferência de paginação.

CI remota e integração continuam pendentes: a validação local Windows não equivale ao workflow Ubuntu/GitHub. Nenhum envio externo de escala é realizado.


### Apresentação dos horários — ajuste de 11/11/2026

Por solicitação do usuário, PDF/PNG/XLSX não imprimem localização de horário. A interface e as saídas formatam o instante de fechamento conforme o dispositivo, sem identificar sua localização. A escala mantém os horários registrados, sem converter turnos ao apresentar/exportar. Os metadados de compatibilidade do arquivo não se tornam rótulos visíveis. Verificação e manifesto incremental no relatório final.
