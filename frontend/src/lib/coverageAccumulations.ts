import type { CoverageBlock, EscalaLivreDocument } from "../types/schedule";
import { coverageAllocation } from "./coverageAllocation";
import { civilMillis } from "./civilTime";

export type CoverageAccumulation={employeeId:string;employeeName:string;start:string;end:string;roles:string[]};

// Presentation of actual contributions, rather than a list of possible permissions.
export function coverageAccumulations(planning:EscalaLivreDocument,blocks:CoverageBlock[]):CoverageAccumulation[] {
  const roleRules=new Map(planning.company.coverage.filter(r=>r.scope!=="team").map(r=>[r.role,r]));
  const periods=new Map<string,CoverageBlock[]>();
  for(const block of blocks)if(block.required>0&&roleRules.has(block.role)){
    const key=block.start+"/"+block.end;
    periods.set(key,[...(periods.get(key)??[]),block]);
  }
  const notices:CoverageAccumulation[]=[];
  for(const period of periods.values()){
    const rolesByPerson=new Map<string,Set<string>>();
    for(const block of period){
      // Legacy results omit IDs; request a trace from the same allocator without
      // changing the legacy analysis or its public JSON shape.
      const ids=block.employeeIds??coverageAllocation(planning,civilMillis(block.start),civilMillis(block.end),
        [roleRules.get(block.role)!],"civil",true)[0].employeeIds??[];
      for(const id of ids){if(!rolesByPerson.has(id))rolesByPerson.set(id,new Set());rolesByPerson.get(id)!.add(block.role);}
    }
    for(const [employeeId,roles] of rolesByPerson)if(roles.size>1)notices.push({employeeId,
      employeeName:planning.employees.find(e=>e.id===employeeId)?.name??employeeId,
      start:period[0].start,end:period[0].end,roles:[...roles].sort()});
  }
  const merged:CoverageAccumulation[]=[],lastByPersonAndRoles=new Map<string,CoverageAccumulation>();
  for(const notice of notices.sort((a,b)=>a.start.localeCompare(b.start)||a.employeeId.localeCompare(b.employeeId))){
    const key=JSON.stringify([notice.employeeId,notice.roles]),previous=lastByPersonAndRoles.get(key);
    if(previous&&previous.end===notice.start)previous.end=notice.end;
    else {merged.push(notice);lastByPersonAndRoles.set(key,notice);}
  }
  return merged;
}
