import { civilDay, civilMillis } from "../civilTime";
import { regimeConstraints } from "../regimes";
import type { ShiftAssignment, WorkloadRule } from "../../types/schedule";

function cycleFor(rule:WorkloadRule) {
  const cycle=regimeConstraints(rule).rollingCycle;
  if(!cycle)throw new Error("O regime não fornece ciclo em dias.");
  return cycle;
}
export const cycleDays=(rule:WorkloadRule)=>{const c=cycleFor(rule);return Math.max(1,c.workDays+c.restDays);};
export const workedDates=(history:ShiftAssignment[],first:number,last:number)=>new Set(history.filter(s=>civilDay(civilMillis(s.start))>=first&&civilDay(civilMillis(s.start))<=last).map(s=>civilDay(civilMillis(s.start)))).size;
export const exceedsCycleEndingOn=(history:ShiftAssignment[],day:number,rule:WorkloadRule)=>workedDates(history,day-(cycleDays(rule)-1)*86400000,day)>cycleFor(rule).workDays;
export function canAddCycleDate(start:number,history:ShiftAssignment[],rule:WorkloadRule) {
  const day=civilDay(start),length=cycleDays(rule),cycle=cycleFor(rule);
  for(let last=day;last<day+length*86400000;last+=86400000) {
    const first=last+(1-length)*86400000;
    const dates=workedDates(history,first,last)+(history.some(a=>civilDay(civilMillis(a.start))===day)?0:1);
    if(dates>cycle.workDays)return false;
  }
  return true;
}
