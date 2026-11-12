import type { EscalaLivreDocument } from "../../types/schedule";
import { planFor, excusedSeconds } from "./contractWorkTargets";
import { selectedNormalDailySeconds } from "./fiveDay42Hours";
import { summarizeWorkloads } from "./weeklyWorkPlan";
import { civilMillis, civilString } from "../civilTime";
import { activeOn } from "./employment";

export const invalidContractDistributions=(planning:EscalaLivreDocument,start:string)=>planning.employees.filter(employee=>{
  const plan=planFor(planning.company,employee);
  return activeOn(employee,start)&&plan&&!plan.flexibleWorkDays&&plan.dailySeconds.reduce((sum,s)=>sum+s,0)!==plan.contractedSeconds;
});

export function contractMinimums(planning:EscalaLivreDocument,start:string,end:string) {
  return planning.employees.flatMap(employee=>{
    const activeEnd=employee.inactiveFrom&&employee.inactiveFrom<=end.slice(0,10)
      ?civilString(civilMillis(employee.inactiveFrom+"T00:00:00")-1000):end;
    if(activeEnd.slice(0,10)<start.slice(0,10))return [];
    return (summarizeWorkloads({...planning,employees:[employee]},start,activeEnd)??[]).map(summary=>{
    const plan=planFor(planning.company,employee)!;
    let requiredSeconds=summary.expectedSeconds;
    if(selectedNormalDailySeconds(plan)===28800) {
      if(!plan.flexibleWorkDays)requiredSeconds=summary.days.reduce((sum,d)=>sum+Math.min(d.expectedSeconds,28800),0);
      else {
        const slots=summary.nominalSeconds/30240;
        const credits=summary.days.map(d=>excusedSeconds(planning.company,employee,d.date.slice(0,10)))
          .sort((a,b)=>b-a).slice(0,slots);
        requiredSeconds=slots*28800-credits.reduce((sum,c)=>sum+28800-Math.min(28800,Math.max(0,30240-c)),0);
      }
    }
    return {employeeId:summary.employeeId,weekStart:summary.weekStart,requiredSeconds,missingSeconds:Math.max(0,requiredSeconds-summary.recognizedSeconds)};
    });
  });
}
