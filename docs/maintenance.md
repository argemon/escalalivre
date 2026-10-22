# Manutenção e dependências

Revisão em 22/10/2026.

## Exportação PDF

O backend usa PDFsharp/MigraDoc 6.2.4, com versão fixa e licença MIT. Fontes Noto Sans Regular e Bold são incorporadas integralmente, com licença SIL OFL distribuída junto aos arquivos. A incorporação integral evita um problema de acentos compostos observado na criação de subconjuntos dessa versão. A geração inclui tabela paginada, cabeçalhos repetidos, datas civis, nomes com acentos e quebras para palavras longas. A impressão mensal no navegador continua disponível.

Referências: [licença da versão utilizada](https://github.com/empira/PDFsharp/blob/v6.2.4/LICENSE), [fontes Noto Sans](https://github.com/notofonts/noto-fonts/tree/main/hinted/ttf/NotoSans), [incorporação de fontes](https://docs.pdfsharp.net/PDFsharp/Topics/Fonts/Font-Embedding.html).

## Dependências

- Atualizações compatíveis aplicadas no lockfile npm, incluindo Vite 6.4.5 e PostCSS 8.5.31.
- Removidas dez dependências diretas sem referências no código: fullcalendar, @fullcalendar/timeline, @hookform/resolvers, react-hook-form, cinco pacotes @radix-ui e class-variance-authority.
- Auditoria npm completa: de 15 alertas (12 altos, 2 moderados e 1 baixo) para 7 (5 altos e 2 moderados).
- Auditoria npm de produção: nenhum alerta conhecido no momento da consulta.
- Auditoria NuGet de toda a solução, incluindo transitivas: nenhum alerta conhecido. A dependência System.Security.Cryptography.Pkcs foi explicitamente elevada para 10.0.13, corrigindo os avisos trazidos pela versão transitiva 8.0.1.

Os sete alertas restantes estão na cadeia de desenvolvimento do Tailwind 3: tailwindcss, chokidar, braces, micromatch, fast-glob, postcss-nested e postcss-selector-parser. O npm propõe migração para Tailwind 4. Essa migração requer revisar configuração, compatibilidade de navegadores, temas e impressão; não foi aplicada automaticamente com --force. As contagens são resultados da consulta nessa data, não uma garantia permanente de ausência de vulnerabilidades.

Comandos para repetir:

~~~sh
cd frontend
npm audit
npm audit --omit=dev
cd ..
dotnet list EscalaLivre.slnx package --vulnerable --include-transitive
~~~

## Carregamento por funcionalidade

A divisão do JavaScript fica para uma alteração própria, após as correções de integridade. Priorizar medição de carregamento inicial e navegação; avaliar carregamento sob demanda do calendário, assistente e impressão. Remover dependências sem uso reduz a superfície de manutenção, mas não garante redução do bundle, pois o empacotador já pode descartá-las. Não alterar o limite de aviso do Vite para ocultar o problema.
