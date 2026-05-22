# EscalaLivre

EscalaLivre is a local-first workforce optimization platform for operational scheduling, labor rule validation, coverage analysis and planning intelligence. It combines a modern React SPA with a .NET scheduling API powered by OR-Tools to generate explainable schedules from company rules, employee constraints, configurable shift regimes, coverage requirements and flexible break windows.

The platform is designed for operational teams that need fast schedule generation without accounts, cloud persistence or database administration. Users configure the operation, generate schedules, inspect coverage gaps, review solver explanations, export a portable `.escalalivre` file and restore the full planning state later.

## Features

- Automatic schedule generation with OR-Tools CP-SAT.
- Labor rule validation for rest windows, weekly limits, availability and operational impossibilities.
- Coverage optimization by role, day and hour.
- Conflict detection for uncovered periods, rest violations and impossible staffing.
- Hiring suggestions with role, weekly hours and critical coverage windows.
- Intelligent lunch and break optimization using flexible break candidates.
- Day-based regimes for configurable work/off cycles.
- Hour-based regimes for continuous shifts, overnight work and temporal rest windows.
- Real DateTime shift intervals with cross-day rendering.
- Operational timeline, coverage heatmap and solver intelligence panel.
- Native `.escalalivre` import/export with schema versioning, UUIDs, ISO-8601 dates and camelCase JSON.
- XLSX and PDF export endpoints.
- Offline-first browser persistence through local state.

## Stack

- Frontend: React, TypeScript, Vite, TailwindCSS, Zustand, TanStack Query, React Hook Form, Zod, FullCalendar-compatible models and shadcn-style UI primitives.
- Backend: .NET 10, ASP.NET Core Minimal APIs, OR-Tools and FluentValidation.
- Architecture: monorepo with domain, application contracts, infrastructure adapters, API endpoints, frontend SPA and documentation.

## Running Locally

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

## Project Structure

```text
/frontend
  React SPA with operational dashboard, local-first store, API client and enterprise scheduling UI.
/backend
  .NET solution with domain models, shift regimes, validation, OR-Tools solver, import/export and API.
/docs
  Architecture, solver, import/export, regimes and business rules documentation.
```

## API

All API responses use the envelope:

```json
{
  "success": true,
  "data": {},
  "errors": [],
  "warnings": [],
  "metadata": {}
}
```

Endpoints:

- `POST /solve`
- `POST /validate`
- `POST /analyze`
- `POST /import`
- `POST /export`

## Future Roadmap

- PWA installation and service worker caching.
- Optional cloud sync.
- Collaborative planning sessions.
- AI-generated rule ingestion.
- Mobile support for schedule review and operational alerts.
