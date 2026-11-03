import { civilMillis } from "./civilTime";
import type { Employee,CoverageRequirement,EscalaLivreDocument,DocumentRole } from "../types/schedule";
export const inheritedCoverageRoleIds=(e:Pick<Employee,"role"|"roleId">,roles:DocumentRole[]=[])=>
 (e.roleId ? roles.find(role=>role.id===e.roleId) : roles.find(role=>role.name===e.role))?.coverageRoleIds ?? [];
export const canCover=(e:Employee,r:CoverageRequirement,roles:DocumentRole[]=[])=>r.scope==="team" || e.role===r.role || (e.coverageRoleIds !== undefined ? Boolean(r.roleId && e.coverageRoleIds.includes(r.roleId)) : Boolean(e.coverageRoles?.includes(r.role))) || Boolean(r.roleId && inheritedCoverageRoleIds(e,roles).includes(r.roleId));
export function coverageAllocation(document:EscalaLivreDocument,start:number,end:number,rules:CoverageRequirement[], clock:"local"|"civil"="local") {
 const stamp=clock==="civil"?civilMillis:Date.parse;
 const people=document.employees.filter(e=>document.assignments.some(a=>a.employeeId===e.id && stamp(a.start)<=start && stamp(a.end)>=end && (!a.break || stamp(a.break.start)>=end || stamp(a.break.end)<=start)));
 // Count each present person once per eligible requirement. Authorizations retain the person's own coverage.
 return rules.map(rule=>({rule,assigned:people.filter(e=>canCover(e,rule,document.roles)).length}));
}
