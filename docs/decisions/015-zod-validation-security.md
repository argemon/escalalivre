# Entrega 3 — Zod e validação segura dos documentos

Data: 31/10/2026. `review/PLANO-CORRECAO.md` continua ausente neste checkout;
foram usados os requisitos da solicitação. Entregas 1/2 preservadas; sem publicação
ou alteração de regra de escala.

## Fontes oficiais e escolha da versão

O [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
classifica versões menores que 4.6.6 como afetadas por exaustão de memória durante
validação de coleções. A correção começa em 4.6.6. A
[release oficial 4.6.6](https://github.com/colinhacks/zod/releases/tag/v4.6.6)
registra a verificação dos limites de tamanho antes de analisar os elementos.
A [release 4.6.7](https://github.com/colinhacks/zod/releases/tag/v4.6.7) também está
disponível; o registro npm confirmou `zod version=4.6.7`, além da existência de
4.6.6 e 4.6.7. Escolhida 4.6.7, fixada exatamente no manifesto e no lockfile.

O instalado anterior era 3.25.76 (`package.json` permitia `^3.25.7`). A mudança
atravessa versão principal, por isso foram revisados o
[guia oficial de migração](https://zod.dev/v4/changelog), o schema usado pelo app
e os contratos de arquivo/armazenamento. A aplicação usa a entrada `zod` v4;
não foi usado `zod/v3` como atalho de compatibilidade.

## Auditorias atualizadas

| Auditoria | Antes | Depois |
| --- | --- | --- |
| npm, incluindo desenvolvimento | 12 pacotes sinalizados: 1 alto, 11 moderados | 11 moderados; nenhum alto |
| npm `--omit=dev` | Zod era a dependência direta afetada em produção | Nenhum aviso |
| NuGet, incluindo transitivos dos nove projetos da solução | Nenhum aviso | Nenhum aviso |

Os 11 avisos moderados restantes são uma cadeia de ferramentas de desenvolvimento
associada a [minimatch/GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249):
minimatch 3.1.5 via ESLint 9.39.4 e minimatch 10.2.5 via
@typescript-eslint/typescript-estree 8.59.3. O aviso oficial marca `<11.0.1` e
informa 11.0.1 como corrigida. Os outros pacotes sinalizados na cadeia são efeitos
transitivos, não 11 vulnerabilidades distintas. `npm audit` informa
`fixAvailable=false` para essa cadeia. Não foi imposto override de versão principal
nem trocada a cadeia de lint neste trabalho: precisa de avaliação/atualização
separada, mantendo testes de compatibilidade. Ela não foi declarada resolvida.

Somente Zod mudou no manifesto/lockfile; não foi usado `npm audit fix --force`.
Relatórios brutos: [npm antes](evidence/dependency-security/npm-before.json),
[npm depois](evidence/dependency-security/npm-after.json),
[npm produção](evidence/dependency-security/npm-production.json) e
[NuGet atualizado](evidence/dependency-security/nuget-after.json).

Comandos executados:

```powershell
npm audit --prefix frontend --json
npm view zod version
npm view zod@4.6.6 version
npm view zod@4.6.7 version
npm install --prefix frontend zod@4.6.7 --save-exact --ignore-scripts
npm audit --prefix frontend --omit=dev --json
npm ls --prefix frontend minimatch
dotnet restore EscalaLivre.slnx --force --no-http-cache -p:NuGetAudit=true -p:NuGetAuditMode=all -p:NuGetAuditLevel=low
dotnet list EscalaLivre.slnx package --vulnerable --include-transitive --format json
```

## Barreiras e compatibilidade

O `z.preprocess` anterior executava migrações que percorriam coleções antes da
validação de seus limites. Atualizar a biblioteca, isoladamente, não elimina esse
trabalho antecipado. `documentStructureIssue` agora verifica objeto/coleções e
seus limites antes de migrar. Usa os mesmos valores compartilhados existentes,
inclusive coleções internas de funcionários/turnos. Não lê elementos de uma
coleção que exceda o limite, nem trunca/corrige documentos para fazê-los passar.

A validação detalhada interrompe cada coleção no primeiro elemento inválido.
Isso também impede crescimento de diagnósticos em listas dentro do limite, mas
com muitos itens malformados. Validações de referência/duplicidade param no
primeiro conflito estrutural. As mensagens/códigos internos de Zod podem mudar;
o app sempre apresentava somente a primeira mensagem. Não mudou a admissibilidade
de conflitos de negócio nos documentos.

Incompatibilidades tratadas explicitamente:

- `uuid()` v4 exige bits de variante/versão que o formato anterior não exigia.
  Usa-se `guid()` com rejeição explícita do identificador vazio, mantendo o
  formato hexadecimal compatível com .NET e documentos legados.
- A inspeção do pacote 4.6.7 e o caso compartilhado `unicode-over` mostraram que
  limites de string contam pontos de código. Foram preservadas as unidades UTF-16
  do contrato C#/TS com verificação de `string.length`, inclusive descrições e fuso.
  O caso compartilhado inicialmente falhou após o upgrade e voltou a passar com
  essa adaptação; sua expectativa não foi alterada.
- Opcionais continuam opcionais; somente campos já anuláveis, como pausa e
  daysMode, aceitam null e normalizam para ausência. Não se ampliou essa permissão
  para todos os campos opcionais. Datas civis com segundos, turnos noturnos,
  instantes de atualização, notação legada e horas totais de duração são mantidos.
- Validade estrutural continua separada de conformidade da escala. As migrações
  existentes e a normalização direcional por IDs permanecem com a mesma semântica.

Importação/exportação nativas continuam limitadas a 1 MiB UTF-8. Leitura/gravação
do estado local, recuperação automática e restauração manual passam pelo mesmo
schema, sem adicionar o limite de arquivo aos documentos válidos já armazenados.
Documentos locais válidos acima de 1 MiB continuam recuperáveis. Rejeições não
sobrescrevem planejamento/bytes anteriores; originais inválidos ficam protegidos
para download e cópias válidas continuam utilizáveis.

## Evidências de testes

Antes da mudança, os 15 testes de `schema-resources.test.cjs` falharam: coleções
excessivas eram percorridas antes da rejeição, e listas inválidas acumulavam
diagnósticos. Os testes usam getters sentinela para provar a ordem da barreira,
sem tentar provocar OOM no processo de teste. Depois, todos passaram.

Foram acrescentados 18 testes no total, cobrindo 14 coleções, listas malformadas
no tamanho máximo, arquivo inválido com exatamente 1 MiB/um byte acima, estado
local inválido acima de 1 MiB, preservação do planejamento e dos bytes, recuperação
por cópia válida, GUID legado, null/opcionais e round-trip de durações/datas civis.
Os casos compartilhados anteriores e os testes de documentos locais válidos
acima de 1 MiB foram mantidos.

Lint/build aprovados; 487 testes frontend aprovados em UTC e 487 em
America/New_York; 664 testes .NET aprovados (379 adaptador, 239 análise/domínio,
33 API e 13 arquitetura). Diferencial C#/TS: 142 cenários aprovados em cada fuso.
A suíte HTTP/worker aprovou os 22 casos, incluindo importação/exportação reais,
fila/cancelamento, datas civis, edição e todas as regressões das entregas 1/2
presentes nessa suíte. Revisão de conteúdo, 45 links locais da documentação e
`git diff --check` concluídos sem problemas.

Comandos de validação: `npm --prefix frontend run lint`,
`npm --prefix frontend run build`, `node --test frontend/tests/*.test.cjs`,
`dotnet test EscalaLivre.slnx -c Release --no-restore -m:1`,
`node tools/parity-differential.cjs` e
`SECURITY_BUILD_CONFIGURATION=Release` com `node backend/security.integration.cjs`.
Frontend e diferencial foram executados em UTC e America/New_York.

## Riscos restantes

Os 11 avisos moderados de desenvolvimento permanecem abertos e exigem trabalho
separado. O build produz dois avisos de comentários de anotação PURE no pacote
Zod; Rollup remove esses comentários e conclui a compilação. Não foi alterado o
bundler para silenciá-los. Não há promessa de desempenho/memória medida.

JSON.parse ainda materializa o texto antes da validação estrutural. Arquivos têm
limite de bytes; armazenamento local mantém a quota do navegador, sem novo teto
global que impeça recuperar documentos válidos antigos. A barreira contém
trabalho/diagnósticos de coleções, mas não é um limite de heap/RSS nem protege
contra falta de memória já ocorrida ao ler/parsear um texto extremo.

Auditorias são um retrato das fontes consultadas nesta data, não garantia de
ausência de vulnerabilidades. Ambiente local Windows/Node 24.14.1/.NET 10.0.401;
CI remota Ubuntu/Node 22 continua pendente antes da integração. Nenhuma publicação.
