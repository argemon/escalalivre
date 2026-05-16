# EscalaLivre

EscalaLivre e um SaaS-like local-first para geracao, otimizacao e validacao de escalas de funcionarios com regras operacionais e trabalhistas brasileiras. Ele combina uma SPA moderna com um backend .NET 10 orientado a solver para transformar disponibilidade, regimes, cobertura minima e restricoes individuais em uma escala operacional analisavel.

O diferencial do produto e tratar escala como planejamento inteligente, nao como CRUD de calendario. O sistema detecta buracos de cobertura, valida conflitos, sugere contratacao e permite que intervalos de almoco sejam otimizados dentro de limites legais e operacionais.

Tudo foi desenhado para funcionar offline apos o carregamento inicial. A persistencia principal e baseada em arquivo nativo `.escalalivre`, com import/export para reconstruir o estado local sem login, conta, banco cloud ou autenticacao.

## Features

- Geracao automatica de escala com solver.
- Regras por funcionario com heranca ou sobrescrita do padrao da empresa.
- Regras da empresa para funcionamento, jornada, almoco, descanso e cobertura.
- Cobertura minima por funcao, dia e faixa horaria.
- Deteccao de buracos operacionais e funcoes insuficientes.
- Sugestao de contratacao por funcao, carga ideal e janela ideal.
- Exportacao/importacao de arquivo nativo `.escalalivre`.
- Estrutura para exportacao XLSX e PDF.
- Suporte a regimes day-based, como 5x2, 6x1 e 4x3.
- Suporte a regimes hour-based, como 12x36 e 24x72.
- Otimizacao de almoco com intervalo movel e configuravel.
- Funcionamento offline-first com estado persistido localmente.

## Stack

- **Frontend:** React, TypeScript, Vite, TailwindCSS, Zustand, TanStack Query, React Hook Form, Zod, FullCalendar e componentes em estilo shadcn/ui.
- **Backend:** .NET 10, ASP.NET Core Minimal APIs, FluentValidation e OR-Tools.
- **Arquitetura:** monorepo modular com dominio, aplicacao, infraestrutura e API separados. O frontend persiste localmente e fala com o backend apenas para solve/validate/analyze/import/export.

## Como Rodar Localmente

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Backend:

```bash
cd backend/EscalaLivre.Api
dotnet restore
dotnet run
```

## Estrutura Do Projeto

```text
/frontend
  SPA React com calendario, paineis inteligentes, estado local-first e import/export.
/backend
  Solucao .NET 10 com API, dominio, aplicacao, infraestrutura e testes.
/docs
  Documentacao de arquitetura, solver, import/export, regimes e regras de negocio.
```

## Screenshots

> Placeholder: calendario semanal com cobertura visual.

> Placeholder: painel inteligente com conflitos, buracos e contratacao sugerida.

> Placeholder: importacao/exportacao local-first.

## Roadmap

- PWA instalavel com cache offline completo.
- Colaboracao local/rede sem obrigatoriedade de cloud.
- Cloud sync opcional.
- IA generativa para explicar conflitos e sugerir cenarios.
- Aplicativo mobile.
