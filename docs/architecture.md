# Arquitetura

EscalaLivre usa um monorepo dividido em frontend, backend e docs. A separacao central e manter o dominio de escala independente de frameworks, persistencia e interface.

## Backend

- `EscalaLivre.Domain`: entidades, value objects e abstracoes de regime.
- `EscalaLivre.Application`: contratos de API, validadores e interfaces de caso de uso.
- `EscalaLivre.Infrastructure`: solver OR-Tools e adaptadores de import/export.
- `EscalaLivre.Api`: Minimal APIs e composicao de dependencias.
- `EscalaLivre.Tests`: testes de regras de dominio e solver.

## Frontend

A SPA usa Zustand com persistencia local para manter o documento aberto no navegador. TanStack Query chama o backend para resolver, validar e analisar, enquanto FullCalendar representa os turnos reais com `start` e `end` ISO-8601.

## Local-first

O arquivo `.escalalivre` e a fonte portavel de verdade. Ele contem `schemaVersion`, `id`, configuracoes da empresa, funcionarios, atribuicoes, timestamps e estruturas em camelCase.
