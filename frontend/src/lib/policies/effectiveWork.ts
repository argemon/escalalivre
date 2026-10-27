import { civilMillis } from "../civilTime";
import { regimeConstraints } from "../regimes";
import type { CompanyRules, Employee, ShiftAssignment, WorkloadRule } from "../../types/schedule";
export const workMillis=(a:ShiftAssignment)=>civilMillis(a.end)-civilMillis(a.start)-(a.break?civilMillis(a.break.end)-civilMillis(a.break.start):0);
export const workloadFor=(company:CompanyRules,e:Employee)=>e.inheritsCompanyDefaults?company.defaultWorkload:e.workload;

export const dailyLimitMillis=(employee:Employee)=>(employee.allowsOvertime?10:8)*3600000;
export const exceedsRegimeWork=(work:number,rule:WorkloadRule)=>{
  const maximum=regimeConstraints(rule).maximumWorkMillis;
  return maximum!==undefined&&work>maximum;
};

export function workMillisInWeek(a:ShiftAssignment,week:number) {
  const from=Math.max(civilMillis(a.start),week),to=Math.min(civilMillis(a.end),week+7*86400000);
  if(to<=from)return 0;
  const pause=a.break?Math.max(0,Math.min(to,civilMillis(a.break.end))-Math.max(from,civilMillis(a.break.start))):0;
  return to-from-pause;
}
