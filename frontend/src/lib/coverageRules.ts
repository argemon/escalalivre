import type { CoverageRequirement, CompanyRules } from "../types/schedule";
export type CoverageDraft = Omit<CoverageRequirement, "day"> & { days: number[] };
export function groupCoverageRules(rules: CoverageRequirement[]): CoverageDraft[] {
  const groups = new Map<string, CoverageDraft>();
  for (const { day, ...rule } of rules) {
    const key = JSON.stringify([rule.role, rule.start, rule.end, rule.minimumEmployees, rule.scope, rule.daysMode, rule.allowsOutsideHours]);
    const group = groups.get(key);
    if (group) { if (!group.days.includes(day)) group.days.push(day); }
    else groups.set(key, { ...rule, days: [day] });
  }
  return Array.from(groups.values(), rule => ({ ...rule, days: rule.days.sort((a,b) => a-b) }));
}
export function expandCoverageRules(rules: CoverageDraft[]): CoverageRequirement[] {
  return rules.flatMap(({ days, ...rule }) => Array.from(new Set(days)).sort((a,b) => a-b).map(day => ({ ...rule, role: rule.role.trim(), day })));
}

export function outsideOperatingHours(company: CompanyRules, day: number, start: string, end: string) {
  const minutes = (s: string) => { const [h,m] = s.split(":").map(Number); return h*60+m; };
  const from = minutes(start), finish = minutes(end) + (minutes(end) <= from ? 1440 : 0);
  const open = minutes(company.opensAt), close = minutes(company.closesAt) + (minutes(company.closesAt) <= open ? 1440 : 0);
  const windows = [-1,0,1].filter(offset => company.operatingDays.includes((day+offset+7)%7)).map(offset => [offset*1440+open,offset*1440+close]);
  let cursor = from;
  for (const [a,b] of windows) { if (a <= cursor && b > cursor) cursor = b; }
  return cursor < finish;
}
export function syncOperatingCoverage(previous: CompanyRules, next: CompanyRules): CoverageRequirement[] {
  return expandCoverageRules(groupCoverageRules(previous.coverage).map(rule => {
    const follows = rule.daysMode === "operating" || (!rule.daysMode && rule.days.length === previous.operatingDays.length && rule.days.every(day => previous.operatingDays.includes(day)));
    return { ...rule, daysMode: follows ? "operating" : "custom", days: follows ? [...next.operatingDays] : rule.days,
      start: !rule.allowsOutsideHours && rule.start === previous.opensAt ? next.opensAt : rule.start,
      end: !rule.allowsOutsideHours && rule.end === previous.closesAt ? next.closesAt : rule.end };
  }));
}
