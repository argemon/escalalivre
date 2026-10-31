# Recuperação de dados

O limite dos arquivos nativos é 1 MiB (1.048.576 bytes UTF-8), definido em shared/native-document-limits.json e usado no frontend e no backend. Importação e exportação validam o mesmo esquema e a mesma versão. A exportação verifica os bytes finais, inclusive espaços de formatação e caracteres não ASCII. A importação verifica tanto o tamanho informado pelo arquivo quanto o texto lido. Arquivos nativos exportados com sucesso podem ser reimportados. Downloads brutos de recuperação usam .json e podem conter dados incompletos ou acima do limite; não são apresentados como arquivos nativos válidos.

O armazenamento do navegador usa o mesmo esquema na gravação e na leitura, sem aplicar o limite de 1 MiB dos arquivos nativos; seu tamanho é limitado pela quota disponível. Documentos e cópias válidos já gravados acima de 1 MiB podem ser restaurados normalmente. Essas cópias podem ser baixadas como JSON bruto e restauradas pelo painel, mas não são apresentadas como arquivos nativos válidos.

A leitura do navegador verifica a estrutura antes de migrar e valida o documento antes de normalizar para apresentação ou analisar. Tema, visualização e documento são os únicos campos recuperados; campos adicionais não substituem ações da aplicação. JSON inválido, documento incompatível, versão futura, indisponibilidade e quota de armazenamento não derrubam a interface. Conteúdos legíveis são preservados para download. Se existir uma cópia válida, ela é carregada; o conteúdo principal inválido não é sobrescrito automaticamente.

Antes de importar um planejamento ou aplicar uma geração bem-sucedida, a aplicação cria e relê uma cópia do documento anterior na chave escalalivre-recovery. São mantidas até três cópias de planejamento, além dos conteúdos originais capturados durante falhas. Se a cópia não puder ser confirmada, a substituição é bloqueada e o documento atual permanece intacto. A cópia pode ser baixada e a operação repetida, inclusive quando o navegador não permite armazenamento. Gerações inviáveis, falhas e respostas antigas não substituem dados nem precisam de nova cópia.

O painel de recuperação permite exportar o planejamento disponível, baixar conteúdos brutos e cópias, restaurar uma cópia válida e tentar salvar novamente. Uma tentativa explícita de salvar preserva os bytes anteriores antes de sobrescrever a chave principal. Se a leitura continuar impossível, os dados da sessão permanecem disponíveis para exportação. A indicação de salvamento só aparece quando o conteúdo passou pela validação usada na reabertura e a gravação foi confirmada por leitura.

Os limites estruturais de entrada são definidos em shared/document-validation-limits.json e aplicados no cadastro, importação e validação para geração nas duas plataformas. Textos têm até 256 unidades UTF-16; há até 200 funcionários, 20.000 turnos, 1.000 cargos/regras de cobertura, 366 feriados/janelas por funcionário e 50 preferências, substituições ou tags por lista. Dias não podem se repetir. Durações usam horas totais (por exemplo, 24:00:00 e 168:00:00); a notação legada de dias do TimeSpan continua legível. Os casos de fronteira compartilhados estão em shared/document-validation-scenarios.json.

Desde a entrega 3, o frontend verifica tipo e tamanho das coleções antes de
migrar os documentos. Essa barreira também vale para gravação/leitura do estado
local e restauração de cópias, que não usam o limite de tamanho dos arquivos.
A validação detalhada interrompe cada coleção no primeiro elemento inválido;
não acumula um erro para cada item de uma coleção malformada. A rejeição preserva
o planejamento atual e os bytes anteriores; o conteúdo inválido do navegador
continua disponível para download e uma cópia válida pode ser carregada.

O Zod foi atualizado para 4.6.7 com adaptação explícita de GUIDs e limites de texto
UTF-16. Campos opcionais/nulos mantêm o contrato anterior: pausa e daysMode nulos
são tratados como ausentes; isso não torna todos os campos opcionais anuláveis.
Datas civis, segundos, durações e migrações continuam com a mesma semântica.
Documentos válidos maiores que 1 MiB já armazenados continuam recuperáveis.
JSON.parse ainda materializa o texto antes da barreira estrutural; ela não é um
limite rígido de heap/RSS. Evidências e auditorias em
[validação de documentos e Zod](decisions/015-zod-validation-security.md).
