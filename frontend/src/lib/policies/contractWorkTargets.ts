import type { CompanyRules, Employee, EscalaLivreDocument, WeeklyWorkPlan } from "../../types/schedule";
import { clockMillis, civilMillis } from "../civilTime";
import { closedHoliday } from "../holidays";
import { regimeConstraints } from "../regimes";

export const durationSeconds=(value:string)=>Math.round(clockMillis(value)/1000);
export const planFor=(company:CompanyRules,employee:Employee)=> (employee.inheritsCompanyDefaults?company.defaultWorkload:employee.workload).weeklyPlan;
export const hasContractPlans=(planning:EscalaLivreDocument)=>planning.employees.some(e=>planFor(planning.company,e)!=null);

export const compensationAppliesOn=(plan:WeeklyWorkPlan,date:string)=>Boolean(plan.compensation && date>=plan.compensation.startsOn && date<=plan.compensation.endsOn);

export const nominalSeconds=(company:CompanyRules,e:Employee,date:string)=>{
 const plan=planFor(company,e);return plan?plan.flexibleWorkDays?Math.ceil(plan.contractedSeconds/plan.flexibleWorkDays):plan.dailySeconds[new Date(civilMillis(date+"T00:00:00")).getUTCDay()]:0;
};
export function excusedSeconds(company:CompanyRules,e:Employee,date:string):number {
 const nominal=nominalSeconds(company,e,date);
 return !planFor(company,e)?.flexibleWorkDays&&closedHoliday(company,date)?nominal:Math.min(nominal,(e.contractLeaves??[]).filter(l=>l.date===date).reduce((n,l)=>n+l.excusedSeconds,0));
}
export const targetSeconds=(company:CompanyRules,e:Employee,date:string)=>nominalSeconds(company,e,date)-excusedSeconds(company,e,date);
export function normalLimitSeconds(company:CompanyRules,e:Employee,date:string):number {
 const plan=planFor(company,e);
 return plan?Math.min(Math.max(0,nominalSeconds(company,e,date)-(e.contractLeaves??[]).filter(l=>l.date===date).reduce((n,l)=>n+l.excusedSeconds,0)),compensationAppliesOn(plan,date)?36000:28800):durationSeconds((e.inheritsCompanyDefaults?company.defaultWorkload:e.workload).defaultShiftDuration);
}
export const contractDailyLimitMillis=(company:CompanyRules,e:Employee,date:string)=>planFor(company,e)?Math.min(36000,normalLimitSeconds(company,e,date)+(e.allowsOvertime?7200:0))*1000:(e.allowsOvertime?10:8)*3600000;
export function desiredWorkSeconds(company:CompanyRules,e:Employee,date:string):number {
 const rule=e.inheritsCompanyDefaults?company.defaultWorkload:e.workload;
 if(!planFor(company,e))return durationSeconds(rule.defaultShiftDuration);
 return Math.min(targetSeconds(company,e,date),normalLimitSeconds(company,e,date),(regimeConstraints(rule).maximumWorkMillis??Infinity)/1000);
}
export const recognizedSeconds=(company:CompanyRules,e:Employee,date:string,work:number)=>Math.max(0,Math.min(work,targetSeconds(company,e,date),desiredWorkSeconds(company,e,date)));
