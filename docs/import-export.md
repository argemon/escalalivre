# Importacao E Exportacao

EscalaLivre e local-first. A persistencia principal e um arquivo `.escalalivre` com JSON estruturado.

## Arquivo nativo

O arquivo nativo deve reconstruir completamente o estado:

- `schemaVersion`
- `id` UUID
- `company`
- `employees`
- `assignments`
- `updatedAt`

Todas as datas usam ISO-8601, todos os nomes usam camelCase e todos os identificadores sao UUID.

## XLSX

XLSX e uma exportacao humana para visualizacao e conferencia. A importacao XLSX deve ser parcial e mapeada para funcionarios, disponibilidade ou turnos, nunca como fonte completa de verdade.

## PDF

PDF e somente impressao/publicacao. Nao deve ser usado para reconstruir estado.

O PDF do backend é renderizado por PDFsharp/MigraDoc 6.2.4 (MIT), com fontes Noto Sans incorporadas (SIL OFL), páginas A4 horizontais, cabeçalho de tabela repetido e numeração. Inclui todos os turnos salvos, com funcionário, função, datas e horários civis, intervalo e origem. A renderização não depende das fontes instaladas no servidor. A impressão mensal do navegador continua disponível pela interface.
