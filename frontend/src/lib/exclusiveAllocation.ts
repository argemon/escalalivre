import type { CoverageRequirement, Employee, DocumentRole } from "../types/schedule";
export const ordinal=(a:string,b:string)=>a<b?-1:a>b?1:0;
export const allocationKey=(r:CoverageRequirement)=>(r.scope??"role")+"/"+(r.roleId??r.role)+"/"+r.role;
export const accumulationAllows=(e:Employee,r:CoverageRequirement,roles:DocumentRole[]=[])=>Boolean(e.accumulationRoleIds?.includes(r.roleId??roles.find(v=>v.name===r.role)?.id??""));
// One explicitly selected accumulation group is active per person. Other permissions remain
// substitutions and are not allocated while this group is active. No implicit union of grants.
export function exclusiveAllocation(people:Employee[],rules:CoverageRequirement[],eligible:(e:Employee,r:CoverageRequirement)=>boolean,roles:DocumentRole[]=[]):Map<CoverageRequirement,string[]>{
 const ordered=[...rules].sort((a,b)=>ordinal(allocationKey(a),allocationKey(b))),persons=[...people].sort((a,b)=>ordinal(a.id,b.id));
 const result=new Map(ordered.map(r=>[r,[] as string[]]));
 for(const r of ordered)if(r.scope==="team")result.set(r,persons.filter(e=>eligible(e,r)).map(e=>e.id));
 for(const e of persons.filter(e=>e.accumulationRoleIds?.length))for(const r of ordered)if(r.scope!=="team"&&accumulationAllows(e,r,roles)&&eligible(e,r))result.get(r)!.push(e.id);
 const exclusive=persons.filter(e=>!e.accumulationRoleIds?.length),roleRules=ordered.filter(r=>r.scope!=="team");
 const choices=new Map(exclusive.map(e=>[e.id,roleRules.filter(r=>eligible(e,r))]));
 const owners=new Map(roleRules.map(r=>[r,[] as Employee[]]));
 function assign(e:Employee,seen:Set<CoverageRequirement>):boolean{for(const r of choices.get(e.id)!){if(seen.has(r))continue;seen.add(r);const assigned=owners.get(r)!;if(assigned.length<r.minimumEmployees-result.get(r)!.length){assigned.push(e);return true;}for(let i=0;i<assigned.length;i++)if(assign(assigned[i],seen)){assigned[i]=e;return true;}}return false;}
 for(const e of exclusive)assign(e,new Set());
 const used=new Set<string>();for(const [rule,staff]of owners)for(const e of staff){result.get(rule)!.push(e.id);used.add(e.id);}
 // Report spare presence once without changing the maximum matching of unmet requirements.
 for(const e of exclusive.filter(e=>!used.has(e.id))){const r=ordered.find(r=>r.scope!=="team"&&r.role===e.role&&eligible(e,r))??ordered.find(r=>r.scope!=="team"&&eligible(e,r));if(r)result.get(r)!.push(e.id);}
 for(const ids of result.values())ids.sort(ordinal);return result;
}
