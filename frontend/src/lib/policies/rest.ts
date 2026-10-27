import { civilMillis, clockMillis } from "../civilTime";
import { workloadFor } from "./effectiveWork";
import { regimeConstraints } from "../regimes";
import type { CompanyRules, Employee, ShiftAssignment, WorkloadRule } from "../../types/schedule";
export const restMillis=(company:CompanyRules,e:Employee)=>Math.max(clockMillis(company.minimumRest),regimeRestMillis(workloadFor(company,e)));

export const regimeRestMillis=(rule:WorkloadRule)=>regimeConstraints(rule).restMillis??0;
export const violatesPreviousRest=(start:number,latestEnd:number,rest:number)=>start-latestEnd<rest;
export const restConflicts=(start:number,end:number,otherStart:number,otherEnd:number,rest:number)=>start<otherEnd+rest&&otherStart<end+rest;
export const fitsRestHistory=(start:number,end:number,history:ShiftAssignment[],rest:number)=>history.every(a=>!restConflicts(start,end,civilMillis(a.start),civilMillis(a.end),rest));
