import { civilDay, civilMillis, civilString, civilWeek, clockMillis } from "./civilTime";
import { authorizedHolidayShift, closedHoliday } from "./holidays";
import type { CompanyRules, Employee, EscalaLivreDocument, ScheduleIssue, ShiftAssignment } from "../types/schedule";
import { workMillis, workloadFor, dailyLimitMillis, exceedsRegimeWork, workMillisInWeek } from "./policies/effectiveWork";
import { regimeConstraints } from "./regimes";
import { restMillis, violatesPreviousRest } from "./policies/rest";
import { fixedBreak, closuresFor, intervalIssue, variableIntervalLimits, conflictsWithClosure } from "./policies/interval";
import { outsideHours, hasOperatingException, isWorkingDay, isNight, matchesFixedStart } from "./policies/eligibility";
import { isAvailable } from "./policies/availability";
import { exceedsCycleEndingOn } from "./policies/dayCycle";

export function shiftDiagnostics(company:CompanyRules,e:Employee,a:ShiftAssignment):ScheduleIssue[] {
  const result:ScheduleIssue[]=[];
  const issue=(code:string,message:string,severity:ScheduleIssue["severity"]="error")=>result.push({code,message,severity,start:a.start,end:a.end,role:a.role,employeeId:e.id});
  const start=civilMillis(a.start),end=civilMillis(a.end),weekday=new Date(start).getUTCDay(),rule=workloadFor(company,e),work=workMillis(a);
  if(end<=start||a.role!==e.role)issue("invalidShift","Turno inválido ou função divergente.");
  if(!isAvailable(e,start,end))issue("availability","Turno fora da disponibilidade ou em horário bloqueado.");
  const exception=hasOperatingException(company,e,a);
  if(!isWorkingDay(company,e,weekday,exception))issue("workingDay","Turno fora dos dias de trabalho.");
  if(outsideHours(company,a))issue("outsideHours",exception?"Fora do expediente com autorização específica.":"Fora do expediente sem autorização específica.",exception?"info":"error");
  if(closedHoliday(company,civilString(start).split("T")[0])&&!authorizedHolidayShift(company,a))issue("holiday","Turno em feriado configurado como fechado.");
  if(!e.allowsNightWork&&isNight(start,end))issue("nightWork","Trabalho noturno não permitido.");
  if(!matchesFixedStart(e,start))issue("fixedStart","Entrada diferente do horário fixo configurado.");
  if(work>clockMillis(rule.defaultShiftDuration))issue("workload","Trabalho efetivo excede a jornada configurada.");
  if(exceedsRegimeWork(work,rule))issue("regime","Trabalho efetivo excede o regime em horas.");
  const pauseProblem=intervalIssue(a);if(pauseProblem)issue("interval",pauseProblem);
  const fixed=fixedBreak(e,a.start);
  if(fixed&&(!a.break||a.break.start!==fixed.start||a.break.end!==fixed.end))issue("fixedInterval","Intervalo diferente do horário fixo configurado.");
  const closures=closuresFor(company,start,end),pause=a.break?civilMillis(a.break.end)-civilMillis(a.break.start):0;
  if(!fixed) {
    const {minimum,maximum}=variableIntervalLimits(company,e,work,closures);
    if((pause<minimum||pause>maximum)&&!pauseProblem)issue("interval","Intervalo fora dos limites da empresa, da jornada ou do fechamento.");
  }
  for(const c of closures) {
    if(conflictsWithClosure(a,c,e.worksDuringLunchClosure))issue("middayClosure",e.worksDuringLunchClosure?"A pausa impede o trabalho durante o fechamento para almoço.":"Falta intervalo cobrindo o fechamento para almoço.");
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
      if(violatesPreviousRest(start,latestEnd,restMillis(document.company,e)))issue("minimumRest","Descanso mínimo entre turnos violado.",start,end);
      latestEnd=Math.max(latestEnd,end);
      days.set(day,[...(days.get(day)??[]),a]);
      if(regimeConstraints(rule).rollingCycle) {
        if(exceedsCycleEndingOn(shifts,day,rule))issue("regime","Dias de trabalho excedem o ciclo configurado.",start,end);
      }
      for(let week=civilWeek(start);week<end;week+=7*86400000) {
        weeks.set(week,(weeks.get(week)??0)+workMillisInWeek(a,week));
      }
    }
    for(const [day,items] of days) {
      if(items.length>1)issue("multipleShifts","Mais de um turno para a mesma pessoa e data de início.",day,day+86400000);
      if(items.reduce((n,a)=>n+workMillis(a),0)>dailyLimitMillis(e))issue("dailyLimit","Limite diário de trabalho efetivo excedido.",day,day+86400000);
    }
    for(const [week,work] of weeks)if(work>rule.weeklyLimitHours*3600000)issue("weeklyLimit","Limite semanal excedido.",week,week+7*86400000);
  }
  return issues;
}
