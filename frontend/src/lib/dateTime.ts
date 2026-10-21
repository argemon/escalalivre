import type { EscalaLivreDocument, ShiftAssignment, ScheduleResult } from "../types/schedule";

// Company schedule values are civil times, never UTC instants.
export const DEFAULT_TIME_ZONE = "America/Cuiaba";
const pad = (n: number) => String(n).padStart(2,"0");
export function validTimeZone(zone: string): boolean {
  try { new Intl.DateTimeFormat("en",{timeZone:zone}).format(); return !!zone; } catch { return false; }
}
export function formatCivilDateTime(date: Date): string {
  if (!Number.isFinite(+date)) throw new Error("Data inválida.");
  return date.getFullYear()+"-"+pad(date.getMonth()+1)+"-"+pad(date.getDate())+"T"+pad(date.getHours())+":"+pad(date.getMinutes())+":"+pad(date.getSeconds());
}
export function validCivilDateTime(value: string): boolean {
  const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,7})?$/.exec(value);
  if (!m) return false;
  const [y,mo,d,h,mi,s]=m.slice(1).map(Number);
  const date=new Date(Date.UTC(y,mo-1,d,h,mi,s));
  return y>=1900 && y<=2100 && date.getUTCFullYear()===y && date.getUTCMonth()===mo-1 && date.getUTCDate()===d && h<24 && mi<60 && s<60;
}
export function civilDateTime(value: string, zone=DEFAULT_TIME_ZONE): string {
  // An unqualified datetime already describes the company's clock. Do not apply the browser zone.
  if (validCivilDateTime(value)) return value.replace(/\.\d+$/ , "");
  if (!validCivilDateTime(value.replace(/(?:Z|[+-]\d{2}:\d{2})$/, "")) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("Data e horário inválidos.");
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(new Date(value));
  const part=(type: string)=>parts.find(p=>p.type===type)!.value;
  const result=part("year")+"-"+part("month")+"-"+part("day")+"T"+part("hour")+":"+part("minute")+":"+part("second");
  if (!validCivilDateTime(result)) throw new Error("Data fora do período suportado.");
  return result;
}
export function datePart(value: string, zone=DEFAULT_TIME_ZONE): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return civilDateTime(value,zone).split("T")[0];
}
export function timePart(value: string, zone=DEFAULT_TIME_ZONE): string { return civilDateTime(value,zone).split("T")[1]; }
export function displayClock(value: string, zone=DEFAULT_TIME_ZONE): string { return timePart(value,zone).split(":").slice(0,2).join(":"); }
export function dateTimeInput(value: string, zone=DEFAULT_TIME_ZONE): string { return value ? datePart(value,zone)+"T"+displayClock(value,zone) : ""; }
export const nowInstant = () => new Date().toISOString();
export function utcInstant(value: string): string {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("A atualização deve informar um instante com fuso horário.");
  return new Date(value).toISOString();
}
export function normalizeDocumentTimes(document: EscalaLivreDocument): EscalaLivreDocument {
  if (!document?.company) return document;
  const zone=document.company.timeZone ?? DEFAULT_TIME_ZONE;
  if (!validTimeZone(zone)) throw new Error("Fuso horário da empresa inválido.");
  const window=<T extends { start: string; end: string }>(w: T): T => ({...w,start:civilDateTime(w.start,zone),end:civilDateTime(w.end,zone)});
  return {...document, company:{...document.company,timeZone:zone}, updatedAt:utcInstant(document.updatedAt),
    employees:document.employees.map(e=>({...e,availability:e.availability.map(window),restrictions:e.restrictions.map(window)})),
    assignments:document.assignments.map(a=>({...window(a),break:a.break ? window(a.break) : undefined}))};
}
export function moveShift(shift: ShiftAssignment, startValue: string, endValue: string, zone=DEFAULT_TIME_ZONE): ShiftAssignment {
  const start=civilDateTime(startValue,zone),end=civilDateTime(endValue,zone);
  const oldStart=civilDateTime(shift.start,zone);
  const delta=Date.parse(start+"Z")-Date.parse(oldStart+"Z");
  const move=(value: string)=>new Date(Date.parse(civilDateTime(value,zone)+"Z")+delta).toISOString().replace(/\.\d{3}Z$/, "");
  return {...shift,start,end,break:shift.break ? {start:move(shift.break.start),end:move(shift.break.end)} : undefined,
    tags:datePart(start)!==datePart(oldStart) ? shift.tags.filter(t=>!t.startsWith("holiday:")) : shift.tags};
}

export function normalizeResultTimes(result: ScheduleResult, zone=DEFAULT_TIME_ZONE): ScheduleResult {
  const window=<T extends {start?:string;end?:string}>(value:T):T => ({...value,...(value.start ? {start:civilDateTime(value.start,zone)} : {}),...(value.end ? {end:civilDateTime(value.end,zone)} : {})});
  return {...result,
    ...(result.assignments ? {assignments:result.assignments.map(a=>({...window(a),break:a.break ? window(a.break) : undefined}))} : {}),
    ...(result.coverage ? {coverage:result.coverage.map(window)} : {}),
    ...(result.gaps ? {gaps:result.gaps.map(window)} : {}),
    ...(result.conflicts ? {conflicts:result.conflicts.map(window)} : {}),
    ...(result.optimizationSuggestions ? {optimizationSuggestions:result.optimizationSuggestions.map(window)} : {}),
    ...(result.hiringSuggestions ? {hiringSuggestions:result.hiringSuggestions.map(h=>({...h,idealWindows:h.idealWindows.map(window)}))} : {})};
}
