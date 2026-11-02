import { summarizeWorkloads, weeklyPlanIssues, planFor } from "./policies/weeklyWorkPlan";
import { buildHiringSuggestions } from "./hiringDemand";
import { normalizeDocumentTimes } from "./dateTime";
import { civilMillis, civilDay, civilString, clockMillis, endOn } from "./civilTime";
import { diagnoseSchedule } from "./laborRules";
import { closureOn } from "./policies/interval";
import { coverageAllocation } from "./coverageAllocation";
import { closedHoliday } from "./holidays";
import { planningPeriod } from "./planningPeriod";
import type { EscalaLivreDocument, ScheduleResult } from "../types/schedule";
export { planningPeriod } from "./planningPeriod";
export { formatCivilDateTime as localDate } from "./dateTime";

export function analyzeDocument(input:EscalaLivreDocument):ScheduleResult {
  const document=normalizeDocumentTimes(input);
  const result:ScheduleResult={assignments:input.assignments,coverage:[],gaps:[],conflicts:diagnoseSchedule(document),decisions:[],hiringSuggestions:[],optimizationSuggestions:[],coverageScore:1,optimization:{status:"not-run"}};
  const period=planningPeriod(document);
  const workloads=summarizeWorkloads(document,period.start,period.end);
  if(workloads)result.workloads=workloads;
  for(const e of document.employees){
   const plan=planFor(document.company,e);if(!plan)continue;
   for(const code of weeklyPlanIssues(plan,(e.inheritsCompanyDefaults?document.company.defaultWorkload:e.workload).weeklyLimitHours))
    result.conflicts.push({code,severity:"warning",message:"Revise a carga contratada, a distribuição diária e a compensação configuradas.",start:civilString(civilDay(civilMillis(period.start))),end:civilString(civilDay(civilMillis(period.end))+86400000),role:e.role,employeeId:e.id});
  }
  for(const summary of workloads??[])if(summary.unmetSeconds>0)result.conflicts.push({code:"workloadShortfall",severity:"warning",message:"Carga contratada não atendida integralmente.",start:summary.days[0].date,end:civilString(civilMillis(summary.days[summary.days.length-1].date)+86400000),employeeId:summary.employeeId,role:document.employees.find(e=>e.id===summary.employeeId)!.role});
  const windows:{rule:typeof document.company.coverage[number];from:number;to:number;closure?:{start:number;end:number}}[]=[];
  for(let day=civilDay(civilMillis(period.start));day<=civilMillis(period.end);day+=86400000) {
    if(closedHoliday(document.company,civilString(day).split("T")[0]))continue;
    for(const rule of document.company.coverage.filter(r=>r.day===new Date(day).getUTCDay())) {
      windows.push({rule,from:day+clockMillis(rule.start),to:endOn(day,rule.start,rule.end),closure:rule.allowsOutsideHours?undefined:closureOn(document.company,day)});
    }
  }
  const boundaries=new Set<number>();for(const w of windows){boundaries.add(w.from);boundaries.add(w.to);for(let t=w.from;t<w.to;t+=3600000)boundaries.add(t);if(w.closure){boundaries.add(w.closure.start);boundaries.add(w.closure.end);}}
  for(const a of document.assignments)for(const v of [a.start,a.end,a.break?.start,a.break?.end])if(v)boundaries.add(civilMillis(v));
  const points=[...boundaries].sort((a,b)=>a-b);
  for(let i=0;i<points.length-1;i++) {
   const start=points[i],finish=points[i+1];const groups=new Map<string,typeof document.company.coverage[number]>();
   for(const w of windows.filter(w=>w.from<=start && w.to>=finish && !(w.closure && start>=w.closure.start && finish<=w.closure.end))) {
    const key=(w.rule.scope ?? "role")+w.rule.role;const previous=groups.get(key);if(!previous || previous.minimumEmployees<w.rule.minimumEmployees)groups.set(key,w.rule);
   }
   for(const {rule,assigned} of coverageAllocation(document,start,finish,[...groups.values()],"civil")) {
    const block={start:civilString(start),end:civilString(finish),role:rule.role,required:rule.minimumEmployees,assigned,state:assigned>=rule.minimumEmployees ? "healthy" as const : assigned===0 ? "uncovered" as const : "warning" as const};
    result.coverage.push(block);
    if(assigned<rule.minimumEmployees){const missingEmployees=rule.minimumEmployees-assigned;const last=[...result.gaps].reverse().find(g=>g.role===rule.role);if(last && last.end===block.start && last.missingEmployees===missingEmployees)last.end=block.end;else result.gaps.push({start:block.start,end:block.end,role:rule.role,missingEmployees});}
   }
  }

  const required=result.coverage.reduce((n,b)=>n+b.required*(civilMillis(b.end)-civilMillis(b.start)),0);
  const covered=result.coverage.reduce((n,b)=>n+Math.min(b.required,b.assigned)*(civilMillis(b.end)-civilMillis(b.start)),0);
  result.coverageScore=required?Math.round(covered/required*1000)/1000:1;
  result.hiringSuggestions=buildHiringSuggestions(result.gaps,document.company.defaultWorkload.weeklyLimitHours);
  return result;
}
