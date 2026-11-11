import type { Employee, ShiftAssignment } from "../../types/schedule";
export const activeOn=(e:Employee,date:string)=>!e.inactiveFrom || date.slice(0,10)<e.inactiveFrom;
export function employeeOn(e:Employee,date:string):Employee {
 const tenure=e.roleHistory?.filter(t=>t.startsOn<=date.slice(0,10)).sort((a,b)=>b.startsOn.localeCompare(a.startsOn))[0];
 return tenure?{...e,role:tenure.role,roleId:tenure.roleId,coverageRoleIds:tenure.coverageRoleIds??e.coverageRoleIds}:e;
}
// Saved exercised role is authoritative for coverage, including legacy history.
export const employeeForShift=(e:Employee,a:ShiftAssignment):Employee=>({...employeeOn(e,a.start),role:a.role,roleId:a.roleId});
