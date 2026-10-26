import { civilDay, civilMillis } from "../civilTime";
import type { ShiftAssignment, WorkloadRule } from "../../types/schedule";

export const cycleDays=(rule:WorkloadRule)=>Math.max(1,rule.workUnits+rule.restUnits);
export const workedDates=(history:ShiftAssignment[],first:number,last:number)=>new Set(history.filter(s=>civilDay(civilMillis(s.start))>=first&&civilDay(civilMillis(s.start))<=last).map(s=>civilDay(civilMillis(s.start)))).size;
export const exceedsCycleEndingOn=(history:ShiftAssignment[],day:number,rule:WorkloadRule)=>workedDates(history,day-(cycleDays(rule)-1)*86400000,day)>rule.workUnits;
export function canAddCycleDate(start:number,history:ShiftAssignment[],rule:WorkloadRule) {
  const day=civilDay(start),length=cycleDays(rule);
  for(let last=day;last<day+length*86400000;last+=86400000) {
    const first=last+(1-length)*86400000;
    const dates=workedDates(history,first,last)+(history.some(a=>civilDay(civilMillis(a.start))===day)?0:1);
    if(dates>rule.workUnits)return false;
  }
  return true;
}
