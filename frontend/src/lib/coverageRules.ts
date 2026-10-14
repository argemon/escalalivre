import type { CoverageRequirement } from "../types/schedule";
export type CoverageDraft = Omit<CoverageRequirement, "day"> & { days: number[] };
export function groupCoverageRules(rules: CoverageRequirement[]): CoverageDraft[] {
  const groups = new Map<string, CoverageDraft>();
  for (const { day, ...rule } of rules) {
    const key = JSON.stringify([rule.role, rule.start, rule.end, rule.minimumEmployees]);
    const group = groups.get(key);
    if (group) { if (!group.days.includes(day)) group.days.push(day); }
    else groups.set(key, { ...rule, days: [day] });
  }
  return Array.from(groups.values(), rule => ({ ...rule, days: rule.days.sort((a,b) => a-b) }));
}
export function expandCoverageRules(rules: CoverageDraft[]): CoverageRequirement[] {
  return rules.flatMap(({ days, ...rule }) => Array.from(new Set(days)).sort((a,b) => a-b).map(day => ({ ...rule, role: rule.role.trim(), day })));
}
