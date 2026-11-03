import { civilDay, civilMillis, civilString, clockMillis, endOn } from "../civilTime";
import { workMillis } from "./effectiveWork";
import type { CompanyRules, Employee, ShiftAssignment } from "../../types/schedule";
export const requiredBreakMinutes=(work:number)=>work>360?60:work>240?15:0;
// Operational generation margin; it is not a statutory numerical minimum.
export const generationPauseMarginMillis=3600000;
export function hasWorkAroundPause(a:ShiftAssignment):boolean {
  return !a.break || (civilMillis(a.break.start)-civilMillis(a.start)>=generationPauseMarginMillis
    && civilMillis(a.end)-civilMillis(a.break.end)>=generationPauseMarginMillis);
}
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

export function variableIntervalLimits(company:CompanyRules,e:Employee,work:number,closures:{start:number;end:number}[]) {
  const minimum=Math.max(requiredBreakMinutes(work/60000)*60000,clockMillis(company.lunch.minimum),...(!e.worksDuringLunchClosure?closures.map(c=>c.end-c.start):[0]));
  return {minimum,maximum:Math.min(7200000,Math.max(minimum,clockMillis(company.lunch.maximum)))};
}
// Preference only; it does not invalidate existing or manually edited shifts.
export function intervalExtensionMillis(company:CompanyRules,e:Employee,a:ShiftAssignment):number {
  if(e.fixedInterval||!a.break)return 0;
  const start=civilMillis(a.start),end=civilMillis(a.end);
  const minimum=variableIntervalLimits(company,e,workMillis(a),closuresFor(company,start,end)).minimum;
  return Math.max(0,civilMillis(a.break.end)-civilMillis(a.break.start)-minimum);
}
export function conflictsWithClosure(a:ShiftAssignment,c:{start:number;end:number},worksDuringClosure=false) {
  const overlaps=a.break&&civilMillis(a.break.start)<c.end&&c.start<civilMillis(a.break.end);
  return worksDuringClosure?overlaps:(!a.break||civilMillis(a.break.start)>c.start||civilMillis(a.break.end)<c.end);
}
