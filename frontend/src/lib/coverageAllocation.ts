import { exclusiveAllocation } from "./exclusiveAllocation";
import { employeeForShift } from "./policies/employment";
import { civilMillis } from "./civilTime";
import type { Employee,CoverageRequirement,EscalaLivreDocument,DocumentRole } from "../types/schedule";
export const inheritedCoverageRoleIds=(e:Pick<Employee,"role"|"roleId">,roles:DocumentRole[]=[])=>
 (e.roleId ? roles.find(role=>role.id===e.roleId) : roles.find(role=>role.name===e.role))?.coverageRoleIds ?? [];
export const canCover=(e:Employee,r:CoverageRequirement,roles:DocumentRole[]=[])=>r.scope==="team" || e.role===r.role || (e.coverageRoleIds !== undefined ? Boolean(r.roleId && e.coverageRoleIds.includes(r.roleId)) : Boolean(e.coverageRoles?.includes(r.role))) || Boolean(r.roleId && inheritedCoverageRoleIds(e,roles).includes(r.roleId));
export function coverageAllocation(document:EscalaLivreDocument,start:number,end:number,rules:CoverageRequirement[], clock:"local"|"civil"="local",includeLegacyPeople=false) {
 const stamp=clock==="civil"?civilMillis:Date.parse;
 const present=new Map<string,typeof document.assignments>();for(const a of document.assignments)if(stamp(a.start)<=start && stamp(a.end)>=end && (!a.break || stamp(a.break.start)>=end || stamp(a.break.end)<=start))present.set(a.employeeId,[...(present.get(a.employeeId)??[]),a]);
 const people=document.employees.filter(e=>present.has(e.id));
 // Count each present person once per eligible requirement. Authorizations retain the person's own coverage.
 const eligible=(e:Employee,rule:CoverageRequirement)=>present.get(e.id)!.some(a=>canCover(employeeForShift(e,a),rule,document.roles));
 if(document.company.coverageMode!=="exclusive")return rules.map(rule=>({rule,assigned:people.filter(e=>eligible(e,rule)).length,employeeIds:includeLegacyPeople?people.filter(e=>eligible(e,rule)).map(e=>e.id).sort():undefined as string[]|undefined}));
 const allocated=exclusiveAllocation(people,rules,eligible,document.roles);
 return rules.map(rule=>({rule,assigned:allocated.get(rule)!.length,employeeIds:allocated.get(rule)}));
}
