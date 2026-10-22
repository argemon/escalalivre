import { civilMillis, civilString, civilWeek } from "./civilTime";
import type { CoverageGap, HiringSuggestion } from "../types/schedule";

const roundHours=(milliseconds:number)=>Math.round(milliseconds/3600000*100)/100;
export function buildHiringSuggestions(gaps:CoverageGap[],referenceWeeklyHours:number):HiringSuggestion[] {
  const roles=new Map<string,CoverageGap[]>();
  for(const gap of gaps){const group=roles.get(gap.role)??[];group.push(gap);roles.set(gap.role,group);}
  return [...roles].map(([role,windows])=>{
    let total=0;
    const weeks=new Map<number,number>(),events=new Map<number,number>();
    for(const gap of windows){
      const start=civilMillis(gap.start),end=civilMillis(gap.end);
      total+=(end-start)*gap.missingEmployees;
      events.set(start,(events.get(start)??0)+gap.missingEmployees);events.set(end,(events.get(end)??0)-gap.missingEmployees);
      for(let week=civilWeek(start);week<end;week+=7*86400000){
        const duration=Math.min(end,week+7*86400000)-Math.max(start,week);
        weeks.set(week,(weeks.get(week)??0)+duration*gap.missingEmployees);
      }
    }
    let active=0,peakMissingEmployees=0;
    for(const [,delta] of [...events].sort((a,b)=>a[0]-b[0])){active+=delta;peakMissingEmployees=Math.max(peakMissingEmployees,active);}
    const peakWeek=Math.max(0,...weeks.values());
    return {role,totalHours:roundHours(total),weeklyHours:roundHours(peakWeek),referenceWeeklyHours,
      minimumPeople:Math.max(peakMissingEmployees,Math.ceil(peakWeek/(referenceWeeklyHours*3600000))),peakMissingEmployees,
      weeklyDemand:[...weeks].sort((a,b)=>a[0]-b[0]).map(([week,hours])=>({weekStart:civilString(week).slice(0,10),hours:roundHours(hours)})),
      idealWindows:windows.map(({start,end})=>({start,end})),rationale:"Estimativa mínima por carga semanal e faltas simultâneas. Disponibilidade, descansos e distribuição dos horários podem exigir mais pessoas."};
  });
}
