import type { CoverageRequirement } from "../types/schedule";

export function groupCoverageForDisplay(requirements: CoverageRequirement[]) {
  const groups = new Map<string, { requirement: CoverageRequirement; days: number[] }>();
  for (const requirement of requirements) {
    const { day, ...settings } = requirement;
    const key = JSON.stringify([settings.scope ?? "role", settings.roleId, settings.role, settings.start, settings.end,
      settings.minimumEmployees, settings.allowsOutsideHours ?? false, settings.daysMode]);
    const group = groups.get(key);
    if (group) { if (!group.days.includes(day)) group.days.push(day); }
    else groups.set(key, { requirement, days: [day] });
  }
  return [...groups.values()];
}

export function formatCoverageDays(days: number[]) {
  const labels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  const ranges: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    let end = start;
    while (i + 1 < sorted.length && sorted[i + 1] === end + 1) end = sorted[++i];
    ranges.push(start === end ? labels[start] : end === start + 1 ? `${labels[start]} e ${labels[end]}` : `${labels[start]} a ${labels[end]}`);
  }
  return ranges.join(", ");
}
