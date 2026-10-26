import { formatCivilDateTime } from "./dateTime";
import { civilMillis, civilString } from "./civilTime";
import { fixedBreak, closuresFor, variableIntervalLimits } from "./policies/interval";
import { shiftDiagnostics } from "./laborRules";
import type { CompanyRules, Employee, ShiftAssignment } from "../types/schedule";

export const minutesOf=(value:string)=>value.split(":").reduce((n,v,i)=>n+Number(v)*[60,1,1/60][i],0);
export const fixedIntervalOn=(e:Employee,start:number)=>fixedBreak(e,formatCivilDateTime(new Date(start)));
export function previewPause(company:CompanyRules,e:Employee,work:number,start:number,limit:number) {
  const fixed=fixedIntervalOn(e,start);
  if(fixed)return (civilMillis(fixed.end)-civilMillis(fixed.start))/60000;
  const closures=closuresFor(company,civilMillis(formatCivilDateTime(new Date(start))),civilMillis(formatCivilDateTime(new Date(limit))));
  const limits=variableIntervalLimits(company,e,work*60000,closures);
  return Math.max(limits.minimum/60000,Math.min(limits.maximum/60000,(limit-start)/60000-work));
}
// Explicit construction for a new/manual shift or a preview; never called as normalization.
export function intervalFor(company:CompanyRules,e:Employee,startValue:number,endValue:number,durationMinutes?:number) {
  const startText=formatCivilDateTime(new Date(startValue)),endText=formatCivilDateTime(new Date(endValue));
  const start=civilMillis(startText),end=civilMillis(endText);
  const assignment:ShiftAssignment={id:"preview",employeeId:e.id,role:e.role,start:startText,end:endText,source:"manual",tags:[]};
  const valid=(pause:ShiftAssignment["break"])=>!shiftDiagnostics(company,e,{...assignment,break:pause}).some(c=>["interval","fixedInterval","middayClosure"].includes(c.code));
  const fixed=fixedBreak(e,startText);if(fixed)return valid(fixed)?fixed:undefined;
  const choices=[...new Set([...(durationMinutes===undefined?[]:[durationMinutes]),0,15,minutesOf(company.lunch.minimum),60,minutesOf(company.lunch.maximum),...Array.from({length:8},(_,i)=>(i+1)*15)])];
  const closures=closuresFor(company,start,end);
  for(const minutes of choices) {
    if(minutes<0||minutes>120)continue;
    if(minutes===0){if(valid(undefined))return undefined;continue;}
    const duration=minutes*60000;let earliest=start+60000,latest=end-duration-60000;
    if(!e.worksDuringLunchClosure)for(const c of closures){earliest=Math.max(earliest,c.end-duration);latest=Math.min(latest,c.start);}
    if(latest<earliest)continue;
    const preferred=Math.max(earliest,Math.min(latest,start+minutesOf(company.lunch.preferredAfter)*60000));
    const starts=[preferred,earliest,latest,...closures.flatMap(c=>[c.end,c.start-duration])];
    for(const at of starts) {
      const pause={start:civilString(at),end:civilString(at+duration)};
      if(at>=earliest&&at<=latest&&valid(pause))return pause;
    }
  }
  return undefined;
}
