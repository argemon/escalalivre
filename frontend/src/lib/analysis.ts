import type { EscalaLivreDocument, ScheduleResult, ShiftAssignment } from "../types/schedule";

export function localDate(value: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth()+1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

export function planningPeriod(document: EscalaLivreDocument) {
  const first = document.assignments.map(a => a.start).sort()[0];
  const start = first ? new Date(first) : new Date();
  start.setHours(0,0,0,0);
  const end = new Date(start);
  end.setDate(end.getDate()+6);
  end.setHours(23,59,59,0);
  return { start: localDate(start), end: localDate(end) };
}

const duration = (value: string) => value.split(":").reduce((n,v,i) => n + Number(v) * [3600000,60000,1000][i], 0);
const at = (day: Date, time: string) => { const d = new Date(day); const [h,m,s] = time.split(":").map(Number); d.setHours(h,m,s ?? 0,0); return d; };
const workTime = (a: ShiftAssignment) => Date.parse(a.end)-Date.parse(a.start)-(a.break ? Date.parse(a.break.end)-Date.parse(a.break.start) : 0);

// Recalculate from the current document, including breaks and overnight shifts.
export function analyzeDocument(document: EscalaLivreDocument): ScheduleResult {
  const result: ScheduleResult = { assignments: document.assignments, coverage: [], gaps: [], conflicts: [], decisions: [], hiringSuggestions: [], optimizationSuggestions: [], coverageScore: 1 };
  const period = planningPeriod(document);
  const end = new Date(period.end);
  for (let day = new Date(period.start); day <= end; day.setDate(day.getDate()+1)) {
    for (const rule of document.company.coverage.filter(r => r.day === day.getDay())) {
      const from = at(day,rule.start), to = at(day,rule.end);
      if (to <= from) to.setDate(to.getDate()+1);
      const boundaries = new Set<number>([+from,+to]);
      for (let t = +from; t < +to; t += 3600000) boundaries.add(t);
      for (const a of document.assignments.filter(a => a.role === rule.role)) {
        for (const value of [a.start,a.end,a.break?.start,a.break?.end]) {
          if (value && Date.parse(value) > +from && Date.parse(value) < +to) boundaries.add(Date.parse(value));
        }
      }
      const points = [...boundaries].sort((a,b) => a-b);
      for (let i=0;i<points.length-1;i++) {
        const start = points[i], finish = points[i+1];
        const assigned = new Set(document.assignments.filter(a => a.role === rule.role && document.employees.some(e => e.id === a.employeeId && e.role === rule.role) && Date.parse(a.start) <= start && Date.parse(a.end) >= finish && (!a.break || Date.parse(a.break.end) <= start || Date.parse(a.break.start) >= finish)).map(a => a.employeeId)).size;
        const block = { start: localDate(new Date(start)), end: localDate(new Date(finish)), role: rule.role, required: rule.minimumEmployees, assigned, state: assigned >= rule.minimumEmployees ? "healthy" as const : assigned === 0 ? "uncovered" as const : "warning" as const };
        result.coverage.push(block);
        if (assigned < rule.minimumEmployees) {
          const missingEmployees = rule.minimumEmployees-assigned;
          const last = result.gaps[result.gaps.length-1];
          if (last && last.role === rule.role && last.end === block.start && last.missingEmployees === missingEmployees) last.end = block.end;
          else result.gaps.push({ start: block.start,end: block.end,role: rule.role,missingEmployees });
        }
      }
    }
  }
  const issue = (code: string, message: string, a: ShiftAssignment) => result.conflicts.push({ code,message,severity: "error",start: a.start,end: a.end,role:a.role });
  for (const employee of document.employees) {
    const rule = employee.inheritsCompanyDefaults ? document.company.defaultWorkload : employee.workload;
    const shifts = document.assignments.filter(a => a.employeeId === employee.id).sort((a,b) => Date.parse(a.start)-Date.parse(b.start));
    const weeks = new Map<string,number>();
    for (let i=0;i<shifts.length;i++) {
      const a = shifts[i], start = new Date(a.start), finish = new Date(a.end);
      if (finish <= start || a.role !== employee.role) issue("invalidShift",`${employee.name}: turno inválido ou função divergente.`,a);
      if (employee.restrictions.some(w => Date.parse(w.start) < +finish && +start < Date.parse(w.end)) || (employee.availability.length > 0 && !employee.availability.some(w => Date.parse(w.start) <= +start && Date.parse(w.end) >= +finish))) issue("availability",`${employee.name}: turno fora da disponibilidade ou em horário bloqueado.`,a);
      const nightEnd = new Date(start); nightEnd.setHours(22,0,0,0);
      if (!employee.allowsNightWork && (start.getHours() < 6 || finish > nightEnd)) issue("nightWork",`${employee.name}: trabalho noturno não permitido.`,a);
      if (i > 0 && +start-Date.parse(shifts[i-1].end) < Math.max(duration(document.company.minimumRest),rule.regimeType === "hourBased" ? rule.restUnits*3600000 : 0)) issue("minimumRest",`${employee.name}: descanso mínimo entre turnos violado.`,a);
      const week = new Date(start); week.setDate(week.getDate()-week.getDay()); week.setHours(0,0,0,0);
      const key = localDate(week); weeks.set(key,(weeks.get(key) ?? 0)+workTime(a));
    }
    for (const [week,hours] of weeks) if (hours > rule.weeklyLimitHours*3600000) result.conflicts.push({ severity:"error",code:"weeklyLimit",message:`${employee.name}: limite semanal excedido.`,start:week,role:employee.role });
  }
  const required = result.coverage.reduce((n,b) => n+b.required*(Date.parse(b.end)-Date.parse(b.start)),0);
  const covered = result.coverage.reduce((n,b) => n+Math.min(b.required,b.assigned)*(Date.parse(b.end)-Date.parse(b.start)),0);
  result.coverageScore = required ? covered/required : 1;
  return result;
}
