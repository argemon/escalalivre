import { civilMillis } from "./civilTime";
import type { Employee,CoverageRequirement,EscalaLivreDocument } from "../types/schedule";
export const canCover=(e:Employee,r:CoverageRequirement)=>r.scope==="team" || e.role===r.role || (r.roleId && e.coverageRoleIds?.includes(r.roleId)) || e.coverageRoles?.includes(r.role);
export function coverageAllocation(document:EscalaLivreDocument,start:number,end:number,rules:CoverageRequirement[], clock:"local"|"civil"="local") {
 const stamp=clock==="civil"?civilMillis:Date.parse;
 const people=document.employees.filter(e=>document.assignments.some(a=>a.employeeId===e.id && stamp(a.start)<=start && stamp(a.end)>=end && (!a.break || stamp(a.break.start)>=end || stamp(a.break.end)<=start)));
 const specific=rules.filter(r=>r.scope!=="team");const slots=specific.flatMap(r=>Array.from({length:r.minimumEmployees},()=>r));
 const owners=new Map<string,number>();const match=(slot:number,visited:Set<string>):boolean=>{
  const rule=slots[slot];for(const e of [...people].sort((a,b)=>Number(b.role===rule.role)-Number(a.role===rule.role))) {
   if(!canCover(e,rule) || visited.has(e.id)) continue;visited.add(e.id);
   const before=owners.get(e.id);if(before===undefined || match(before,visited)){owners.set(e.id,slot);return true;}
  }return false;
 };
 slots.forEach((_,i)=>match(i,new Set()));
 const counts=new Map<string,number>();for(const slot of owners.values()) counts.set(slots[slot].role,(counts.get(slots[slot].role) ?? 0)+1);
 for(const e of people.filter(e=>!owners.has(e.id))) {const role=specific.find(r=>r.role===e.role) ?? specific.find(r=>canCover(e,r));if(role)counts.set(role.role,(counts.get(role.role) ?? 0)+1);}
 return rules.map(rule=>({rule,assigned:rule.scope==="team" ? people.length : counts.get(rule.role) ?? 0}));
}
