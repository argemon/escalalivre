import { civilDay, civilMillis, civilString, civilWeek, clockMillis, endOn } from "./civilTime";
import { authorizedHolidayShift, closedHoliday } from "./holidays";
import { canCover } from "./coverageAllocation";
import type { CompanyRules, Employee, EscalaLivreDocument, ScheduleIssue, ShiftAssignment } from "../types/schedule";

export const requiredBreakMinutes=(work:number)=>work>360?60:work>240?15:0;
export const workMillis=(a:ShiftAssignment)=>civilMillis(a.end)-civilMillis(a.start)-(a.break?civilMillis(a.break.end)-civilMillis(a.break.start):0);
export const workloadFor=(company:CompanyRules,e:Employee)=>e.inheritsCompanyDefaults?company.defaultWorkload:e.workload;
export const restMillis=(company:CompanyRules,e:Employee)=>Math.max(clockMillis(company.minimumRest),workloadFor(company,e).regimeType==="hourBased"?workloadFor(company,e).restUnits*3600000:0);
export function closureOn(company:CompanyRules,day:number):{start:number;end:number}|undefined {
  if(!company.middayClosure)return undefined;
  const c=company.middayClosure;const date=day+(clockMillis(c.start)<clockMillis(company.opensAt)?86400000:0);
  return {start:date+clockMillis(c.start),end:endOn(date,c.start,c.end)};
}
export function closuresFor(company:CompanyRules,start:number,end:number) {
  const result:{start:number;end:number}[]=[];
  for(let day=civilDay(start)-86400000;day<=civilDay(end);day+=86400000){const c=closureOn(company,day);if(c&&start<c.end&&c.start<end)result.push(c);}
  return result;
}
export function fixedBreak(e:Employee,start:string) {
  if(!e.fixedInterval)return undefined;
  const from=civilMillis(start),c=e.fixedInterval;let day=civilDay(from);
  if(day+clockMillis(c.start)<=from)day+=86400000;
  return {start:civilString(day+clockMillis(c.start)),end:civilString(endOn(day,c.start,c.end))};
}
export function intervalIssue(a:ShiftAssignment):string|undefined {
  const pause=a.break?civilMillis(a.break.end)-civilMillis(a.break.start):0;
  if(a.break&&(civilMillis(a.break.start)<=civilMillis(a.start)||civilMillis(a.break.end)>=civilMillis(a.end)||pause<=0))return "Intervalo deve ficar dentro da jornada, com trabalho antes e depois.";
  const minimum=requiredBreakMinutes(workMillis(a)/60000);
  if(pause<minimum*60000)return "Esta jornada exige pelo menos "+minimum+" minutos de intervalo.";
  if(pause>7200000)return "Intervalo acima do máximo de 2 horas.";
}
export function outsideHours(company:CompanyRules,a:ShiftAssignment):boolean {
  let cursor=civilMillis(a.start);const finish=civilMillis(a.end);
  for(let day=civilDay(cursor)-86400000;day<=civilDay(finish);day+=86400000) {
    if(!company.operatingDays.includes(new Date(day).getUTCDay()))continue;
    const from=day+clockMillis(company.opensAt),to=endOn(day,company.opensAt,company.closesAt);
    if(from<=cursor&&to>cursor)cursor=to;
  }
  return cursor<finish;
}
export function shiftDiagnostics(company:CompanyRules,e:Employee,a:ShiftAssignment):ScheduleIssue[] {
  const result:ScheduleIssue[]=[];
  const issue=(code:string,message:string,severity:ScheduleIssue["severity"]="error")=>result.push({code,message,severity,start:a.start,end:a.end,role:a.role,employeeId:e.id});
  const start=civilMillis(a.start),end=civilMillis(a.end),day=civilDay(start),weekday=new Date(start).getUTCDay(),rule=workloadFor(company,e),work=workMillis(a);
  if(end<=start||a.role!==e.role)issue("invalidShift","Turno inválido ou função divergente.");
  if(e.restrictions.some(w=>civilMillis(w.start)<end&&start<civilMillis(w.end))||(e.availability.length>0&&!e.availability.some(w=>civilMillis(w.start)<=start&&civilMillis(w.end)>=end)))issue("availability","Turno fora da disponibilidade ou em horário bloqueado.");
  const exception=authorizedHolidayShift(company,a)||company.coverage.some(r=>r.allowsOutsideHours&&canCover(e,r)&&r.day===weekday&&day+clockMillis(r.start)<=start&&end<=endOn(day,r.start,r.end));
  if((!e.inheritsCompanyDefaults&&e.workingDays&&!e.workingDays.includes(weekday))||(!company.operatingDays.includes(weekday)&&!exception))issue("workingDay","Turno fora dos dias de trabalho.");
  if(outsideHours(company,a))issue("outsideHours",exception?"Fora do expediente com autorização específica.":"Fora do expediente sem autorização específica.",exception?"info":"error");
  if(closedHoliday(company,civilString(start).split("T")[0])&&!authorizedHolidayShift(company,a))issue("holiday","Turno em feriado configurado como fechado.");
  if(!e.allowsNightWork&&(new Date(start).getUTCHours()<6||end>day+22*3600000))issue("nightWork","Trabalho noturno não permitido.");
  if(e.shiftStartsAt&&start!==day+clockMillis(e.shiftStartsAt))issue("fixedStart","Entrada diferente do horário fixo configurado.");
  if(work>clockMillis(rule.defaultShiftDuration))issue("workload","Trabalho efetivo excede a jornada configurada.");
  if(rule.regimeType==="hourBased"&&work>rule.workUnits*3600000)issue("regime","Trabalho efetivo excede o regime em horas.");
  const pauseProblem=intervalIssue(a);if(pauseProblem)issue("interval",pauseProblem);
  const fixed=fixedBreak(e,a.start);
  if(fixed&&(!a.break||a.break.start!==fixed.start||a.break.end!==fixed.end))issue("fixedInterval","Intervalo diferente do horário fixo configurado.");
  const closures=closuresFor(company,start,end),pause=a.break?civilMillis(a.break.end)-civilMillis(a.break.start):0;
  if(!fixed) {
    const minimum=Math.max(requiredBreakMinutes(work/60000)*60000,clockMillis(company.lunch.minimum),...(!e.worksDuringLunchClosure?closures.map(c=>c.end-c.start):[0]));
    const maximum=Math.min(7200000,Math.max(minimum,clockMillis(company.lunch.maximum)));
    if((pause<minimum||pause>maximum)&&!pauseProblem)issue("interval","Intervalo fora dos limites da empresa, da jornada ou do fechamento.");
  }
  for(const c of closures) {
    const overlaps=a.break&&civilMillis(a.break.start)<c.end&&c.start<civilMillis(a.break.end);
    if(e.worksDuringLunchClosure?overlaps:(!a.break||civilMillis(a.break.start)>c.start||civilMillis(a.break.end)<c.end))issue("middayClosure",e.worksDuringLunchClosure?"A pausa impede o trabalho durante o fechamento para almoço.":"Falta intervalo cobrindo o fechamento para almoço.");
  }
  return result;
}
export function diagnoseSchedule(document:EscalaLivreDocument):ScheduleIssue[] {
  const issues:ScheduleIssue[]=[];
  for(const a of document.assignments){const e=document.employees.find(e=>e.id===a.employeeId);if(e)issues.push(...shiftDiagnostics(document.company,e,a));else issues.push({code:"unknownEmployee",message:"Turno referencia pessoa inexistente.",severity:"error",start:a.start,end:a.end,role:a.role,employeeId:a.employeeId});}
  for(const e of document.employees) {
    const rule=workloadFor(document.company,e),shifts=document.assignments.filter(a=>a.employeeId===e.id).sort((a,b)=>civilMillis(a.start)-civilMillis(b.start)||a.id.localeCompare(b.id));
    const issue=(code:string,message:string,start:number,end:number)=>issues.push({code,message,severity:"error",start:civilString(start),end:civilString(end),role:e.role,employeeId:e.id});
    let latestEnd=-Infinity;const days=new Map<number,ShiftAssignment[]>(),weeks=new Map<number,number>();
    for(const a of shifts) {
      const start=civilMillis(a.start),end=civilMillis(a.end),day=civilDay(start);
      if(start-latestEnd<restMillis(document.company,e))issue("minimumRest","Descanso mínimo entre turnos violado.",start,end);
      latestEnd=Math.max(latestEnd,end);
      days.set(day,[...(days.get(day)??[]),a]);
      if(rule.regimeType==="dayBased") {
        const from=day-(Math.max(1,rule.workUnits+rule.restUnits)-1)*86400000;
        const worked=new Set(shifts.filter(s=>civilDay(civilMillis(s.start))>=from&&civilDay(civilMillis(s.start))<=day).map(s=>civilDay(civilMillis(s.start))));
        if(worked.size>rule.workUnits)issue("regime","Dias de trabalho excedem o ciclo configurado.",start,end);
      }
      for(let week=civilWeek(start);week<end;week+=7*86400000) {
        const from=Math.max(start,week),to=Math.min(end,week+7*86400000);if(to<=from)continue;
        const pause=a.break?Math.max(0,Math.min(to,civilMillis(a.break.end))-Math.max(from,civilMillis(a.break.start))):0;
        weeks.set(week,(weeks.get(week)??0)+to-from-pause);
      }
    }
    for(const [day,items] of days) {
      if(items.length>1)issue("multipleShifts","Mais de um turno para a mesma pessoa e data de início.",day,day+86400000);
      if(items.reduce((n,a)=>n+workMillis(a),0)>(e.allowsOvertime?10:8)*3600000)issue("dailyLimit","Limite diário de trabalho efetivo excedido.",day,day+86400000);
    }
    for(const [week,work] of weeks)if(work>rule.weeklyLimitHours*3600000)issue("weeklyLimit","Limite semanal excedido.",week,week+7*86400000);
  }
  return issues;
}
