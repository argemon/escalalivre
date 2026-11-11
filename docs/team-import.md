# Cadastro e importação de equipe

O formulário oferece os modelos existentes de 5x2 e 6x1 e o padrão da empresa. O resumo permite conferir ciclo, carga, teto e intervalo; o modelo não certifica enquadramento jurídico. As opções avançadas permanecem montadas ao recolher a seção e conservam seus valores.

Prioridades de novas preferências: baixa = 1, média = 5, alta = 10. São pesos relativos da preferência existente, sem alteração da fórmula canônica. Outros pesos legados, inclusive negativos e zero, aparecem como personalizados e são preservados sem arredondamento.

Duplicar exige novo nome e gera novo GUID. Uma lista explícita copia jornada, permissões e preferências recorrentes; não copia turnos, disponibilidade datada, bloqueios, dispensas de carga nem campos pessoais desconhecidos. A cópia não altera a pessoa original.

O lote exige pessoas, cadastro de referência e campos escolhidos explicitamente. Jornada é um grupo indicado no rótulo, incluindo dias, intervalo, trabalho no fechamento e folgas. A função não faz parte deste lote. A prévia lista diferenças por pessoa. A confirmação valida o documento inteiro antes de uma única atualização e recusa documento alterado após a prévia. Turnos são preservados.

## Formato da equipe

CSV UTF-8 (BOM opcional), separador ponto e vírgula, cabeçalho obrigatório nome;funcao;modelo. Aspas duplas permitem separador, quebra de linha e aspas escapadas por duplicação. Modelo: 5x2, 6x1 ou empresa. Função deve coincidir com uma única função cadastrada, sem distinção entre maiúsculas/minúsculas. Nenhum cadastro é sobrescrito. Nomes iguais exigem confirmação explícita de que se trata de outra pessoa.

XLSX: uma única planilha, mesmas colunas A–C e cabeçalho. Texto simples, compartilhado e inline são aceitos. Fórmulas, células com erro, arquivos criptografados e referências externas são recusados. O modelo CSV disponível abre no Excel e pode ser salvo como XLSX. Não há execução de fórmulas nem upload a servidor.

Limites: 2 MiB de arquivo, 200 linhas de pessoas além do cabeçalho, três colunas; continuam valendo os limites nativos de pessoas, nomes e jornadas. XLSX também limita 500 entradas ZIP, 8 MiB de expansão total e 4 MiB por XML, com conferência da expansão durante a leitura.

O leitor usa APIs nativas do navegador (ZIP limitado, DOMParser e DecompressionStream), sem dependência de produção nova. A prévia de cadastro valida cada linha; erros e possíveis duplicações impedem a confirmação até exclusão explícita ou confirmação pertinente. Arquivos malformados são recusados antes da prévia. Cancelar não altera o documento. Se o documento mudar enquanto a prévia estiver aberta, é necessário reler o arquivo.
