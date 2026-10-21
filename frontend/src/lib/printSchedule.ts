import { normalizeDocumentTimes, datePart, displayClock } from "./dateTime";
import type { EscalaLivreDocument, ShiftAssignment } from "../types/schedule";

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function weekStart(date: Date): Date {
  const sunday = new Date(date);
  sunday.setDate(sunday.getDate() - sunday.getDay());
  return sunday;
}

export function periodDays(start: string, end: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) return [];
  const cursor = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  if (!Number.isFinite(+cursor) || !Number.isFinite(+last) || dateKey(cursor) !== start || dateKey(last) !== end) return [];
  const days: string[] = [];
  while (cursor <= last && days.length <= 366) {
    days.push(dateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days.length <= 366 ? days : [];
}

export function printWeeks(document: EscalaLivreDocument, start: string, end: string) {
  document = normalizeDocumentTimes(document);
  const selectedDays = periodDays(start, end);
  if (!selectedDays.length) return [];
  const days: string[] = [];
  const cursor = weekStart(new Date(`${start}T12:00:00`));
  while (dateKey(cursor) <= end) {
    for (let i = 0; i < 7; i++) {
      days.push(dateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  const shifts = document.assignments.filter(a => datePart(a.start) >= start && datePart(a.start) <= end)
    .sort((a, b) => a.start.localeCompare(b.start));
  const people = document.employees.map(e => ({ id: e.id, name: e.name, role: e.role }));
  for (const shift of shifts) {
    if (!people.some(e => e.id === shift.employeeId)) people.push({ id: shift.employeeId, name: "Pessoa não cadastrada", role: shift.role });
  }
  const weeks: { days: string[]; rows: { person: typeof people[number]; cells: ShiftAssignment[][] }[] }[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const week = days.slice(i, i + 7);
    weeks.push({ days: week, rows: people.map(person => ({
      person,
      cells: week.map(day => shifts.filter(a => a.employeeId === person.id && datePart(a.start) === day))
    })) });
  }
  return weeks;
}

export const displayDate = (date: string) => date.split("-").reverse().join("/");
export function monthBounds(month: string): { start: string; end: string } | undefined {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return undefined;
  const start = `${month}-01`;
  const last = new Date(`${start}T12:00:00`);
  last.setMonth(last.getMonth() + 1, 0);
  return { start, end: dateKey(last) };
}
export const displayTime = (value: string) => displayClock(value);
export function dayOffset(value: string, start: string) {
  const days = Math.round((+new Date(`${datePart(value)}T12:00:00`) - +new Date(`${datePart(start)}T12:00:00`)) / 86400000);
  return days > 0 ? ` (+${days}d)` : "";
}

export function employeePrintRows(document: EscalaLivreDocument, month: string) {
  document = normalizeDocumentTimes(document);
  const bounds = monthBounds(month);
  if (!bounds) return [];
  const shifts = document.assignments.filter(a => datePart(a.start) >= bounds.start && datePart(a.start) <= bounds.end);
  const people = document.employees.map(e=>({id:e.id,name:e.name,role:e.role}));
  for (const shift of shifts) if (!people.some(e=>e.id===shift.employeeId)) people.push({id:shift.employeeId,name:"Pessoa não cadastrada",role:shift.role});
  people.sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")||a.id.localeCompare(b.id));
  return people.flatMap(person=>{
    const groups: { person: typeof person; start: string; end: string; hours: string; interval: string; role: string }[] = [];
    const sorted = shifts.filter(a=>a.employeeId===person.id).sort((a,b)=>a.start.localeCompare(b.start));
    for (const shift of sorted) {
      const day = datePart(shift.start);
      const hours = `${displayTime(shift.start)}–${displayTime(shift.end)}${dayOffset(shift.end,shift.start)}`;
      const interval = shift.break ? `${displayTime(shift.break.start)}${dayOffset(shift.break.start,shift.start)}–${displayTime(shift.break.end)}${dayOffset(shift.break.end,shift.start)}` : "Sem intervalo";
      const previous = groups.at(-1);
      const next = previous ? new Date(previous.end+"T12:00:00") : undefined;
      next?.setDate(next.getDate()+1);
      if (previous && next && dateKey(next)===day && previous.hours===hours && previous.interval===interval && previous.role===shift.role) previous.end=day;
      else groups.push({person,start:day,end:day,hours,interval,role:shift.role});
    }
    return groups.length ? groups : [{person,start:"",end:"",hours:"—",interval:"—",role:person.role}];
  });
}
