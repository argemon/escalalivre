import { coverageAllocation, canCover } from "./coverageAllocation";
import { closedHoliday, authorizedHolidayShift } from "./holidays";
import { intervalProblem, fixedIntervalOn } from "./intervals";
import { middayClosureFor, outsideOperatingHours } from "./coverageRules";
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
  const windows: {rule:typeof document.company.coverage[number];from:number;to:number;closure?:{start:number;end:number}}[]=[];
  for(let day=new Date(period.start);day<=end;day.setDate(day.getDate()+1)) {
   if(closedHoliday(document.company,localDate(day).slice(0,10))) continue;
   for(const rule of document.company.coverage.filter(r=>r.day===day.getDay())) {
    const from=at(day,rule.start),to=at(day,rule.end);if(to<=from)to.setDate(to.getDate()+1);
    windows.push({rule,from:+from,to:+to,closure:rule.allowsOutsideHours ? undefined : middayClosureFor(document.company,day)});
   }
  }
  const boundaries=new Set<number>();for(const w of windows){boundaries.add(w.from);boundaries.add(w.to);for(let t=w.from;t<w.to;t+=3600000)boundaries.add(t);if(w.closure){boundaries.add(w.closure.start);boundaries.add(w.closure.end);}}
  for(const a of document.assignments)for(const v of [a.start,a.end,a.break?.start,a.break?.end])if(v)boundaries.add(Date.parse(v));
  const points=[...boundaries].sort((a,b)=>a-b);
  for(let i=0;i<points.length-1;i++) {
   const start=points[i],finish=points[i+1];const groups=new Map<string,typeof document.company.coverage[number]>();
   for(const w of windows.filter(w=>w.from<=start && w.to>=finish && !(w.closure && start>=w.closure.start && finish<=w.closure.end))) {
    const key=(w.rule.scope ?? "role")+w.rule.role;const previous=groups.get(key);if(!previous || previous.minimumEmployees<w.rule.minimumEmployees)groups.set(key,w.rule);
   }
   for(const {rule,assigned} of coverageAllocation(document,start,finish,[...groups.values()])) {
    const block={start:localDate(new Date(start)),end:localDate(new Date(finish)),role:rule.role,required:rule.minimumEmployees,assigned,state:assigned>=rule.minimumEmployees ? "healthy" as const : assigned===0 ? "uncovered" as const : "warning" as const};
    result.coverage.push(block);
    if(assigned<rule.minimumEmployees){const missingEmployees=rule.minimumEmployees-assigned;const last=[...result.gaps].reverse().find(g=>g.role===rule.role);if(last && last.end===block.start && last.missingEmployees===missingEmployees)last.end=block.end;else result.gaps.push({start:block.start,end:block.end,role:rule.role,missingEmployees});}
   }
  }
  const issue = (code: string, message: string, a: ShiftAssignment) => result.conflicts.push({ code,message,severity: "error",start: a.start,end: a.end,role:a.role });
  for (const employee of document.employees) {
    const rule = employee.inheritsCompanyDefaults ? document.company.defaultWorkload : employee.workload;
    const shifts = document.assignments.filter(a => a.employeeId === employee.id).sort((a,b) => Date.parse(a.start)-Date.parse(b.start));
    const weeks = new Map<string,number>();
    for (let i=0;i<shifts.length;i++) {
      const a = shifts[i], start = new Date(a.start), finish = new Date(a.end);
      if(workTime(a) > (employee.allowsOvertime ? 10 : 8)*3600000) issue("dailyLimit",employee.name+": limite diário de trabalho excedido.",a);
      const fixed=fixedIntervalOn(employee,+start);
      if(fixed && (!a.break || Date.parse(a.break.start)!==Date.parse(fixed.start) || Date.parse(a.break.end)!==Date.parse(fixed.end))) issue("fixedInterval",employee.name+": intervalo diferente do horário fixo configurado.",a);
      const pauseIssue=intervalProblem(a); if(pauseIssue) issue("interval",employee.name+": "+pauseIssue,a);
      if(closedHoliday(document.company,localDate(start).slice(0,10)) && !authorizedHolidayShift(document.company,a)) issue("holiday",employee.name+": turno em feriado configurado como fechado.",a);
      const exception = authorizedHolidayShift(document.company,a) || document.company.coverage.some(r => r.allowsOutsideHours && canCover(employee,r) && r.day === start.getDay() && (() => { const from = at(start,r.start), to = at(start,r.end); if (to <= from) to.setDate(to.getDate()+1); return +from <= +start && +finish <= +to; })());
      if (outsideOperatingHours(document.company,start.getDay(),a.start.slice(11,19),a.end.slice(11,19))) result.conflicts.push({code:"outsideHours",severity:exception ? "info" : "error",message:employee.name+": fora do expediente"+(exception ? " — cobertura excepcional autorizada para "+a.role : " — sem cobertura excepcional autorizada para esta função"),start:a.start,end:a.end,role:a.role});
      const closure = middayClosureFor(document.company, start);
      if (!employee.worksDuringLunchClosure && closure && +start < closure.end && +finish > closure.start && (!a.break || Date.parse(a.break.start) > Math.max(+start,closure.start) || Date.parse(a.break.end) < Math.min(+finish,closure.end))) issue("middayClosure", `${employee.name}: falta intervalo durante o fechamento para almoço.`, a);
      if ((!document.company.operatingDays.includes(start.getDay()) && !exception) || (!employee.inheritsCompanyDefaults && employee.workingDays && !employee.workingDays.includes(start.getDay()))) issue("workingDay", `${employee.name}: turno fora dos dias de trabalho.`, a);
      if (finish <= start || a.role !== employee.role) issue("invalidShift",`${employee.name}: turno inválido ou função divergente.`,a);
      if (employee.restrictions.some(w => Date.parse(w.start) < +finish && +start < Date.parse(w.end)) || (employee.availability.length > 0 && !employee.availability.some(w => Date.parse(w.start) <= +start && Date.parse(w.end) >= +finish))) issue("availability",`${employee.name}: turno fora da disponibilidade ou em horário bloqueado.`,a);
      const nightEnd = new Date(start); nightEnd.setHours(22,0,0,0);
      if (!employee.allowsNightWork && (start.getHours() < 6 || finish > nightEnd)) issue("nightWork",`${employee.name}: trabalho noturno não permitido.`,a);
      if (i > 0 && +start-Date.parse(shifts[i-1].end) < Math.max(duration(document.company.minimumRest),rule.regimeType === "hourBased" ? rule.restUnits*3600000 : 0)) issue("minimumRest",`${employee.name}: descanso mínimo entre turnos violado.`,a);
      if (rule.regimeType === "dayBased") {
        const cycleStart = new Date(start); cycleStart.setDate(cycleStart.getDate()-Math.max(1,rule.workUnits+rule.restUnits)+1); cycleStart.setHours(0,0,0,0);
        const workedDays = new Set(shifts.filter(s => Date.parse(s.start) >= +cycleStart && Date.parse(s.start) <= +start).map(s => s.start.slice(0,10)));
        if (workedDays.size > rule.workUnits) issue("regime", `${employee.name}: dias de trabalho excedem o ciclo configurado.`, a);
      }
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
