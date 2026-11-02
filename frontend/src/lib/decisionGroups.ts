import type { SolverDecision } from "../types/schedule";

// Summarize repeated explanations without dropping differences between shifts.
export function groupDecisions(decisions: SolverDecision[]) {
  const groups = new Map<string, SolverDecision[]>();
  for (const decision of decisions) {
    const group = groups.get(decision.employeeId) ?? [];
    group.push(decision);
    groups.set(decision.employeeId, group);
  }
  return [...groups].map(([employeeId, shifts]) => ({
    employeeId,
    reasons: [...new Set(shifts.map(shift => shift.reason))],
    commonFactors: [...new Set(shifts[0].factors)].filter(factor => shifts.every(shift => shift.factors.includes(factor))),
    shifts,
  }));
}
