import type { EscalaLivreDocument } from "../types/schedule";

export type PlanningPeriod = { start: string; end: string };
const dayKey = (d: Date) => [d.getFullYear(), String(d.getMonth()+1).padStart(2,"0"), String(d.getDate()).padStart(2,"0")].join("-");
export function periodError(period: PlanningPeriod): string | undefined {
  const valid = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && s >= "1900-01-01" && s <= "2100-12-31" && Number.isFinite(Date.parse(s+"T12:00:00")) && dayKey(new Date(s+"T12:00:00")) === s;
  if (!valid(period.start) || !valid(period.end)) return "Informe datas válidas entre 1900 e 2100.";
  const days = (Date.parse(period.end+"T00:00:00Z")-Date.parse(period.start+"T00:00:00Z"))/86400000;
  if (days < 0) return "O fim deve ser igual ou posterior ao início.";
  if (days >= 31) return "Selecione no máximo 31 dias de planejamento.";
}
export function defaultPlanningPeriod(now = new Date()): PlanningPeriod {
  const end = new Date(now); end.setDate(end.getDate()+6);
  return { start: dayKey(now), end: dayKey(end) };
}
// Infer the old seven-day window only once, when opening a legacy document.
export function migratePlanningPeriod<T extends { assignments: { start: string }[]; planningPeriod?: PlanningPeriod }>(document: T): T & { planningPeriod: PlanningPeriod } {
  if (document.planningPeriod) {
    const error = periodError(document.planningPeriod);
    if (error) throw new Error(error);
    return { ...document, planningPeriod: { ...document.planningPeriod } };
  }
  const first = document.assignments.map(a => a.start).sort()[0];
  return { ...document, planningPeriod: defaultPlanningPeriod(first ? new Date(first) : new Date()) };
}
export function planningPeriod(document: EscalaLivreDocument) {
  const error = periodError(document.planningPeriod);
  if (error) throw new Error(error);
  return { start: document.planningPeriod.start+"T00:00:00", end: document.planningPeriod.end+"T23:59:59" };
}
export function planningDays(document: EscalaLivreDocument): string[] {
  const days: string[] = [];
  for (const day = new Date(document.planningPeriod.start+"T12:00:00"); dayKey(day) <= document.planningPeriod.end; day.setDate(day.getDate()+1)) days.push(dayKey(day));
  return days;
}
export function exclusivePeriodEnd(document: EscalaLivreDocument): string {
  const end = new Date(document.planningPeriod.end+"T12:00:00"); end.setDate(end.getDate()+1); return dayKey(end);
}
