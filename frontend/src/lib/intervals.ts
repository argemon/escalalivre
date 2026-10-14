import type { CompanyRules, Employee, ShiftAssignment } from "../types/schedule";
import { middayClosureFor } from "./coverageRules";
export const minutesOf = (v:string) => {const [h,m,s=0]=v.split(":").map(Number);return h*60+m+s/60;};
export const requiredInterval = (workMinutes:number) => workMinutes > 360 ? 60 : workMinutes > 240 ? 15 : 0;
const local = (n:number) => { const d=new Date(n), pad=(v:number)=>String(v).padStart(2,"0"); return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())+"T"+pad(d.getHours())+":"+pad(d.getMinutes())+":00"; };
export function fixedIntervalOn(employee:Employee,start:number) {
 if(!employee.fixedInterval) return undefined;
 const from=new Date(start);const [h,m,s=0]=employee.fixedInterval.start.split(":").map(Number);from.setHours(h,m,s,0);if(+from<=start) from.setDate(from.getDate()+1);
 const length=(minutesOf(employee.fixedInterval.end)-minutesOf(employee.fixedInterval.start)+1440)%1440;
 return {start:local(+from),end:local(+from+length*60000)};
}
export function previewPause(company:CompanyRules,employee:Employee,work:number,start:number,limit:number) {
 if(employee.fixedInterval) return (minutesOf(employee.fixedInterval.end)-minutesOf(employee.fixedInterval.start)+1440)%1440;
 let minimum=Math.max(requiredInterval(work),minutesOf(company.lunch.minimum));
 const closure=employee.worksDuringLunchClosure ? undefined : middayClosureFor(company,new Date(start));
 if(closure && closure.start>=start && closure.end<=limit) minimum=Math.max(minimum,(closure.end-closure.start)/60000);
 const maximum=Math.min(120,Math.max(minimum,minutesOf(company.lunch.maximum)));
 const needed=(limit-start)/60000-work;
 return Math.max(minimum,Math.min(maximum,needed));
}
export function intervalFor(company:CompanyRules,employee:Employee,start:number,end:number,durationMinutes?:number) {
 const fixed=fixedIntervalOn(employee,start);if(fixed) return fixed;

 const closure = employee.worksDuringLunchClosure ? undefined : middayClosureFor(company,new Date(start));
 const span=(end-start)/60000;
 const minimum = durationMinutes ?? (span > 375 ? Math.max(60,minutesOf(company.lunch.minimum)) : span > 240 ? Math.max(15,minutesOf(company.lunch.minimum)) : minutesOf(company.lunch.minimum));
 if (!minimum || minimum >= span) return undefined;
 const latest=end-minimum*60000-60000;
 let earliest=start+60000, latestAllowed=latest;
 if(closure && closure.start<end && closure.end>start) {
   earliest=Math.max(earliest,closure.end-minimum*60000);
   latestAllowed=Math.min(latestAllowed,closure.start);
 }
 if(latestAllowed<earliest) return undefined;
 let at=Math.max(earliest,Math.min(latestAllowed,start+Math.max(1,minutesOf(company.lunch.preferredAfter))*60000));
 if(employee.worksDuringLunchClosure) {
  const closed=middayClosureFor(company,new Date(start));
  if(closed && at<closed.end && at+minimum*60000>closed.start) at=closed.end+minimum*60000 <= end-60000 ? closed.end : closed.start-minimum*60000;
 }
 return at>start && at+minimum*60000<end ? {start:local(at),end:local(at+minimum*60000)} : undefined;
}
export function intervalProblem(a:ShiftAssignment) {
 const span=(Date.parse(a.end)-Date.parse(a.start))/60000;
 const pause=a.break ? (Date.parse(a.break.end)-Date.parse(a.break.start))/60000 : 0;
 if(a.break && (Date.parse(a.break.start)<=Date.parse(a.start) || Date.parse(a.break.end)>=Date.parse(a.end) || pause<=0)) return "Intervalo deve ficar dentro da jornada, com trabalho antes e depois.";
 const needed=requiredInterval(span-pause);
 if(pause<needed) return "CLT: esta jornada exige pelo menos "+needed+" minutos de intervalo.";
 if(pause>120) return "Intervalo acima de 2 horas exige acordo escrito ou contrato coletivo; ajuste a configuração.";
 return undefined;
}
