import type { CompanyRules, Employee, WorkloadRule } from "../../types/schedule";
import { distributeWeekly } from "./weeklyWorkPlan";
import { workloadFor } from "./effectiveWork";

export const employeePattern=(rule:WorkloadRule)=>rule.regimeType==="dayBased"&&rule.workUnits+rule.restUnits===7&&[5,6].includes(rule.workUnits)?String(rule.workUnits):"custom";
export const flexibleDayDuration=(plan:{contractedSeconds:number;flexibleWorkDays?:number})=>Math.ceil(plan.contractedSeconds/(plan.flexibleWorkDays??1));
export const automaticDayCount=(e:Employee)=>!e.workingDays&&employeePattern(e.workload)!=="custom"?e.workload.workUnits:undefined;
function referenceDays(seconds:number,days:number[],previous?:number[]):number[] {
 try{return distributeWeekly(seconds,days).dailySeconds;}catch{return previous??Array<number>(7).fill(0);}
}
export function selectEmployeePattern(e:Employee,company:CompanyRules,days:number):Employee {
 const rule=workloadFor(company,e),contracted=rule.weeklyPlan?.contractedSeconds??(days===5?40:44)*3600;
 return {...e,inheritsCompanyDefaults:false,workingDays:undefined,workload:{...rule,regimeType:"dayBased",workUnits:days,restUnits:7-days,
  weeklyPlan:{contractedSeconds:contracted,dailySeconds:referenceDays(contracted,Array.from({length:days},(_,i)=>i+1),rule.weeklyPlan?.dailySeconds),compensation:rule.weeklyPlan?.compensation,flexibleWorkDays:days}}};
}
export function selectEmployeeDays(e:Employee,company:CompanyRules,automatic:boolean):Employee {
 const rule=workloadFor(company,e),count=rule.weeklyPlan?.flexibleWorkDays??rule.workUnits;
 const days=e.workingDays?.length===count?e.workingDays:[1,2,3,4,5,6,0].filter(d=>company.operatingDays.includes(d)).slice(0,count);
 const fixed=days.length?days:[1];
 return {...e,inheritsCompanyDefaults:false,workingDays:automatic?undefined:fixed,workload:{...rule,weeklyPlan:rule.weeklyPlan?automatic
  ?{...rule.weeklyPlan,flexibleWorkDays:count}
  :{contractedSeconds:rule.weeklyPlan.contractedSeconds,dailySeconds:referenceDays(rule.weeklyPlan.contractedSeconds,fixed,rule.weeklyPlan.dailySeconds),compensation:rule.weeklyPlan.compensation}:undefined}};
}
export function transitionIssues(company:CompanyRules,e:Employee,end:string):string[] {
 if(end.slice(0,10)<"2026-12-16")return [];
 const rule=workloadFor(company,e),count=rule.weeklyPlan?.flexibleWorkDays??(rule.regimeType==="dayBased"&&rule.workUnits+rule.restUnits===7?rule.workUnits:0);
 const issues:string[]=[];
 if(count>5)issues.push("weeklyRestTransition");
 if(rule.weeklyPlan&&rule.weeklyPlan.contractedSeconds>(end.slice(0,10)>="2027-12-16"?40:42)*3600)issues.push("contractHoursTransition");
 return issues;
}
