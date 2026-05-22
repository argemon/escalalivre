# Solver

EscalaLivre uses `OrToolsScheduleSolver` with OR-Tools CP-SAT to transform company rules, employee rules, configurable regimes and coverage requirements into operational schedules.

## Responsibilities

- Generate shift candidates by employee, day, role, regime and availability.
- Generate flexible break candidates inside eligible shifts.
- Enforce one assignment per employee per day.
- Enforce weekly hour limits by employee.
- Enforce coverage requirements per role and hourly block when enough feasible candidates exist.
- Reject infeasible models with hard solver errors.
- Analyze existing assignments without regenerating the plan.
- Produce coverage blocks, coverage gaps, hiring suggestions, optimization suggestions and solver decisions.

## Hard Constraints

- Minimum rest between shifts.
- Employee availability and restriction windows.
- Company operating days and operating hours.
- Weekly hour limits.
- Day-based and hour-based regime eligibility.
- Required coverage by role, day and time block.

## Soft Optimization

- Preference weighting through employee preference tags.
- Lunch positioning near preferred operational windows.
- Reduced coverage loss during break periods.
- Assignment scoring that favors operational coverage while preserving constraints.

## Break Optimization

Breaks are represented as candidate `BreakWindow` values attached to shift candidates. The solver can choose between different break starts and legal break durations. Coverage calculations exclude employees whose break overlaps a coverage block, which allows the engine to detect and suggest lunch movements that recover staffing during peak windows.

## Explainability

Solver output includes `SolverDecision` records. Each decision links an assignment to the employee, reason and factors such as coverage protection, availability, rest compliance, weekly limit compliance and break placement.
