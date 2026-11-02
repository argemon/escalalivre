import type { Employee, EscalaLivreDocument, WorkloadSummary } from "../../types/schedule";
import { civilDay, civilMillis, civilString, civilWeek } from "../civilTime";
import { workMillis, workMillisInWeek } from "./effectiveWork";
import { planFor, excusedSeconds, desiredWorkSeconds, recognizedSeconds } from "./contractWorkTargets";
import type { CompanyRules } from "../../types/schedule";

export const normalWeekSeconds=(company:CompanyRules,e:Employee,week:number)=>{
 const plan=planFor(company,e)!,count=plan.flexibleWorkDays!,basic=Math.floor(plan.contractedSeconds/count);
 const credits=Array.from({length:7},(_,i)=>excusedSeconds(company,e,civilString(week+i*86400000).slice(0,10))).sort((a,b)=>b-a).slice(0,count);
 return Math.max(0,plan.contractedSeconds-credits.reduce((n,c)=>n+Math.min(c,basic),0)-Math.min(plan.contractedSeconds%count,credits.filter(c=>c>basic).length));
};

export function summarizeFlexible(planning:EscalaLivreDocument,e:Employee,start:string,end:string):WorkloadSummary[] {
 const plan=planFor(planning.company,e)!,count=plan.flexibleWorkDays!,shifts=planning.assignments.filter(a=>a.employeeId===e.id);
 const from=civilDay(civilMillis(start)),to=civilDay(civilMillis(end)),result:WorkloadSummary[]=[];
 for(let week=civilWeek(from);week<=to;week+=7*86400000){
  const weekDates=Array.from({length:7},(_,i)=>week+i*86400000),dates=weekDates.filter(d=>d>=from&&d<=to);
  const basic=Math.floor(plan.contractedSeconds/count);
  const historyDates=weekDates.filter(d=>(d<from||d>to)&&(shifts.some(a=>civilDay(civilMillis(a.start))===d)||excusedSeconds(planning.company,e,civilString(d).slice(0,10))>0));
  const used=historyDates.filter(d=>excusedSeconds(planning.company,e,civilString(d).slice(0,10))+recognizedSeconds(planning.company,e,civilString(d).slice(0,10),shifts.filter(a=>civilDay(civilMillis(a.start))===d).reduce((n,a)=>n+workMillis(a)/1000,0))>basic).length;
  const slots=Math.min(dates.length,Math.max(0,count-historyDates.length)),nominal=basic*slots+Math.min(slots,Math.max(0,plan.contractedSeconds%count-used));
  let remaining=nominal;
  const work=(day:number)=>shifts.filter(a=>civilDay(civilMillis(a.start))===day).reduce((n,a)=>n+workMillis(a)/1000,0);
  const leave=(day:number)=>excusedSeconds(planning.company,e,civilString(day).slice(0,10));
  const extras=nominal-basic*slots;
  const selected=dates.filter(d=>work(d)>0||leave(d)>0).sort((a,b)=>leave(b)-leave(a)||work(b)-work(a)||a-b).slice(0,slots)
   .sort((a,b)=>Number(leave(b)>basic)-Number(leave(a)>basic)||(work(b)+leave(b))-(work(a)+leave(a))||a-b);
  const targets=new Map(selected.map((d,i)=>[d,basic+(i<extras?1:0)]));
  const days=dates.slice().sort((a,b)=>Number(leave(b)>0)-Number(leave(a)>0)||work(b)-work(a)||a-b).map(day=>{
   const date=civilString(day),planned=work(day),credit=leave(day),target=targets.get(day)??0;
   remaining-=target;
   const excused=Math.min(target,credit),expected=target-excused,recognized=Math.max(0,Math.min(planned,expected,desiredWorkSeconds(planning.company,e,date.slice(0,10))));
   return {date,nominalSeconds:target,excusedSeconds:excused,expectedSeconds:expected,plannedSeconds:planned,recognizedSeconds:recognized,unmetSeconds:Math.max(0,expected-recognized),excessSeconds:Math.max(0,planned-recognized)};
  }).sort((a,b)=>a.date.localeCompare(b.date));
  const sum=(key:keyof Omit<typeof days[number],"date">)=>days.reduce((n,d)=>n+d[key],0);
  const history=shifts.filter(a=>civilDay(civilMillis(a.start))<from||civilDay(civilMillis(a.start))>to).reduce((n,a)=>n+workMillisInWeek(a,week)/1000,0);
  result.push({employeeId:e.id,weekStart:civilString(week),contractedSeconds:plan.contractedSeconds,nominalSeconds:nominal,excusedSeconds:sum("excusedSeconds"),expectedSeconds:nominal-sum("excusedSeconds"),plannedSeconds:sum("plannedSeconds"),recognizedSeconds:sum("recognizedSeconds"),unmetSeconds:remaining+sum("unmetSeconds"),excessSeconds:sum("excessSeconds"),historicalWorkSeconds:history,days,unassignedSeconds:remaining});
 }
 return result;
}
