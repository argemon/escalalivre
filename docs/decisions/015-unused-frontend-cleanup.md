# Limpeza de código sem consumidores — 31/10/2026

## Problema e escopo

A revisão encontrou componentes e helpers exportados sem referências nos fontes,
testes ou ferramentas do repositório. O lint e o TypeScript com
`--noUnusedLocals --noUnusedParameters` já passavam: exports sem consumidores não
são identificados por essas verificações.

Removidos `EmployeeSidebar`, `InsightPanel`, o resultado fictício `sampleAnalysis`
e os helpers `middayClosureFor` e `coverageForRequirement`. A busca por seus
identificadores e pelos caminhos dos módulos confirmou ausência de consumidores.
O documento de exemplo continua disponível e usado.

Removidos também `QueryClient`/`QueryClientProvider` da raiz e a dependência
`@tanstack/react-query`, incluindo `@tanstack/query-core` do lockfile. Não havia
consultas, mutations ou outros consumidores desse contexto no projeto.

## Comportamento e verificações

A interface ativa, regras, contratos JSON e preservação dos documentos não foram
alterados. Não foram encontrados `console.log` ou `debugger` em `frontend/src`;
as saídas de ferramentas CLI foram mantidas. Nenhuma classe C# foi removida sem
evidência de que seria dispensável.

Validação local em Windows/Node 24:

- `npm --prefix frontend run lint` e build de produção aprovados.
- TypeScript com `--noUnusedLocals --noUnusedParameters` aprovado.
- Frontend: 487 testes aprovados em cada execução (fuso local e America/New_York).
- `dotnet test EscalaLivre.slnx -c Release --no-restore`: 664 testes aprovados
  (239 análise, 379 adaptador, 33 API e 13 arquitetura).
- Paridade diferencial: 142 entradas aprovadas em UTC e America/New_York.
- Build Release da API aprovado, sem avisos ou erros.
- Integração HTTP/worker real: 22 testes aprovados em UTC.

Build/testes que precisam criar subprocessos foram executados fora da sandbox
após falha EPERM na tentativa restrita. O build frontend emite avisos sobre
comentários de anotação em Zod; a biblioteca não foi alterada nesta limpeza.
A CI remota do novo diff ainda é necessária antes da integração. Não houve
publicação nem medição de ganho de desempenho.
