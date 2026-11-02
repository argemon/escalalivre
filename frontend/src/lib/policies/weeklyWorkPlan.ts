import type { CompanyRules, Employee, EscalaLivreDocument, WeeklyWorkPlan, WorkloadSummary, DailyWorkload } from "../../types/schedule";
import { clockMillis, civilMillis, civilString, civilDay, civilWeek } from "../civilTime";
import { closedHoliday } from "../holidays";
import { workMillis, workMillisInWeek } from "./effectiveWork";
import { regimeConstraints } from "../regimes";
import { hoursToDuration, formatDuration } from "../duration";

export function distributeWeekly(seconds:number, days:number[], fridaySeconds?:number):WeeklyWorkPlan {
  if(!Number.isInteger(seconds)||seconds<1||seconds>604800||!days.length||new Set(days).size!==days.length||days.some(d=>!Number.isInteger(d)||d<0||d>6)
    ||(fridaySeconds!==undefined&&(!Number.isInteger(fridaySeconds)||fridaySeconds<0||fridaySeconds>seconds||!days.includes(5)||days.length<2)))throw new Error("Dias contratuais ou carga inválidos.");
  const selected=days.filter(d=>fridaySeconds===undefined||d!==5).sort((a,b)=>a-b),remaining=seconds-(fridaySeconds??0);
  const dailySeconds=Array<number>(7).fill(0);
  selected.forEach((d,i)=>dailySeconds[d]=Math.floor(remaining/selected.length)+(i<remaining%selected.length?1:0));
  if(fridaySeconds!==undefined)dailySeconds[5]=fridaySeconds;
  if(dailySeconds.some(s=>s>86400))throw new Error("Duração diária acima de 24h.");
  return {contractedSeconds:seconds,dailySeconds};
}
export const planFor=(company:CompanyRules,employee:Employee)=> (employee.inheritsCompanyDefaults?company.defaultWorkload:employee.workload).weeklyPlan;
export const hasContractPlans=(planning:EscalaLivreDocument)=>planning.employees.some(e=>planFor(planning.company,e)!=null);
export function weeklyPlanIssues(plan:WeeklyWorkPlan,ceilingHours:number):string[] {
  const issues:string[]=[];
  if(plan.dailySeconds.reduce((a,b)=>a+b,0)!==plan.contractedSeconds)issues.push("distributionTotal");
  if(plan.contractedSeconds>ceilingHours*3600)issues.push("contractAboveCeiling");
  if(plan.dailySeconds.some(s=>s>36000))issues.push("distributionDailyLimit");
  if(plan.dailySeconds.some(s=>s>28800)&&!plan.compensation)issues.push("compensationRequired");
  return issues;
}
export const durationSeconds=(value:string)=>Math.round(clockMillis(value)/1000);
export const secondsDuration=(seconds:number)=>hoursToDuration(seconds/3600);
export function plannedExit(entry:string,workSeconds:number,pauseSeconds:number):string {
  const total=durationSeconds(entry)+workSeconds+pauseSeconds,days=Math.floor(total/86400);
  return secondsDuration(total%86400)+(days?` (+${days} dia)`:"");
}
export function intervalDescription(lunch:CompanyRules["lunch"]):string {
  return durationSeconds(lunch.minimum)===durationSeconds(lunch.maximum)
    ? `Duração fixa: ${formatDuration(lunch.minimum)}`
    : `Faixa permitida: ${formatDuration(lunch.minimum)}–${formatDuration(lunch.maximum)}`;
}
export const weeklyPlanMessages:Record<string,string>={
  distributionTotal:"A soma dos dias difere da carga contratada.",contractAboveCeiling:"A carga contratada supera o teto semanal.",
  distributionDailyLimit:"A distribuição supera 10h em um dia.",compensationRequired:"Trabalho normal acima de 8h exige compensação própria; permitir extras não a substitui."
};

export const weeklyPlanTotal=(plan:WeeklyWorkPlan)=>plan.dailySeconds.reduce((a,b)=>a+b,0);

export const compensationAppliesOn=(plan:WeeklyWorkPlan,date:string)=>Boolean(plan.compensation && date>=plan.compensation.startsOn && date<=plan.compensation.endsOn);

export const nominalSeconds=(company:CompanyRules,e:Employee,date:string)=>planFor(company,e)?.dailySeconds[new Date(civilMillis(date+"T00:00:00")).getUTCDay()]??0;
export function excusedSeconds(company:CompanyRules,e:Employee,date:string):number {
 const nominal=nominalSeconds(company,e,date);
 return closedHoliday(company,date)?nominal:Math.min(nominal,(e.contractLeaves??[]).filter(l=>l.date===date).reduce((n,l)=>n+l.excusedSeconds,0));
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
export function summarizeWorkloads(planning:EscalaLivreDocument,start:string,end:string):WorkloadSummary[]|undefined {
 const summaries:WorkloadSummary[]=[];
 for(const e of planning.employees) {
  const plan=planFor(planning.company,e);if(!plan)continue;
  const shifts=planning.assignments.filter(a=>a.employeeId===e.id),weeks=new Map<number,DailyWorkload[]>();
  for(let day=civilDay(civilMillis(start));day<=civilDay(civilMillis(end));day+=86400000){
   const date=civilString(day),key=date.slice(0,10),nominal=nominalSeconds(planning.company,e,key),excused=excusedSeconds(planning.company,e,key),expected=nominal-excused;
   const planned=shifts.filter(a=>a.start.slice(0,10)===key).reduce((n,a)=>n+workMillis(a)/1000,0),recognized=recognizedSeconds(planning.company,e,key,planned);
   const row={date,nominalSeconds:nominal,excusedSeconds:excused,expectedSeconds:expected,plannedSeconds:planned,recognizedSeconds:recognized,unmetSeconds:Math.max(0,expected-recognized),excessSeconds:Math.max(0,planned-recognized)};
   const week=civilWeek(day);weeks.set(week,[...(weeks.get(week)??[]),row]);
  }
  for(const [week,days] of weeks){
   const sum=(field:keyof Omit<DailyWorkload,"date">)=>days.reduce((n,d)=>n+d[field],0);
   const history=shifts.filter(a=>a.start.slice(0,10)<start.slice(0,10)||a.start.slice(0,10)>end.slice(0,10)).reduce((n,a)=>n+workMillisInWeek(a,week)/1000,0);
   summaries.push({employeeId:e.id,weekStart:civilString(week),contractedSeconds:plan.contractedSeconds,nominalSeconds:sum("nominalSeconds"),excusedSeconds:sum("excusedSeconds"),expectedSeconds:sum("expectedSeconds"),plannedSeconds:sum("plannedSeconds"),recognizedSeconds:sum("recognizedSeconds"),unmetSeconds:sum("unmetSeconds"),excessSeconds:sum("excessSeconds"),historicalWorkSeconds:history,days});
  }
 }
 return summaries.length?summaries:undefined;
}
