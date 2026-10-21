import { datePart } from "./dateTime";
import type { EscalaLivreDocument, ShiftAssignment } from "../types/schedule";
import type { PlanningPeriod } from "./planningPeriod";

// Date ownership is based on the start day; never split a shift during replacement.
export function belongsToPeriod(shift: ShiftAssignment, period: PlanningPeriod): boolean {
  const date = datePart(shift.start);
  return date >= period.start && date <= period.end;
}
export function replacePeriodAssignments(document: EscalaLivreDocument, generated: ShiftAssignment[]): ShiftAssignment[] {
  return [...document.assignments.filter(a => !belongsToPeriod(a, document.planningPeriod)),
    ...generated.filter(a => belongsToPeriod(a, document.planningPeriod))];
}
export function weeklyWork(shift: ShiftAssignment): { start: Date; milliseconds: number }[] {
  const start = new Date(shift.start), end = new Date(shift.end);
  const week = new Date(start); week.setDate(week.getDate()-week.getDay()); week.setHours(0,0,0,0);
  const result: { start: Date; milliseconds: number }[] = [];
  for (; week < end; week.setDate(week.getDate()+7)) {
    const next = new Date(week); next.setDate(next.getDate()+7);
    const from = Math.max(+start,+week), to = Math.min(+end,+next);
    if (to <= from) continue;
    const pause = shift.break ? Math.max(0,Math.min(to,Date.parse(shift.break.end))-Math.max(from,Date.parse(shift.break.start))) : 0;
    result.push({start:new Date(week),milliseconds:to-from-pause});
  }
  return result;
}
