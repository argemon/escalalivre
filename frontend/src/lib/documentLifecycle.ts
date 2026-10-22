import { normalizeDocumentTimes } from "./dateTime";
import { migratePlanningPeriod } from "./planningPeriod";
import { migrateCoverageRoles, normalizeRoles } from "./roles";
import type { EscalaLivreDocument, ShiftAssignment } from "../types/schedule";

export const DOCUMENT_MIGRATIONS = {
  companyZone:"company-time-zone-v1", civilTimes:"qualified-times-to-company-civil-v1",
  precision:"schedule-second-precision-v1", period:"explicit-planning-period-v1", updatedAt:"utc-update-instant-v1", coverageRoles:"coverage-role-ids-v1"
} as const;
export function migrateDocument(input:EscalaLivreDocument):{document:EscalaLivreDocument;applied:string[]} {
  const applied:string[]=[];
  if(!input.company.timeZone)applied.push(DOCUMENT_MIGRATIONS.companyZone);
  const windows=[...input.assignments.flatMap(a=>[a,...(a.break?[a.break]:[])]),...input.employees.flatMap(e=>[...e.availability,...e.restrictions])];
  if(windows.some(w=>[w.start,w.end].some(s=>/(?:Z|[+-]\d{2}:\d{2})$/.test(s))))applied.push(DOCUMENT_MIGRATIONS.civilTimes);
  if(windows.some(w=>[w.start,w.end].some(s=>/\.\d+/.test(s))))applied.push(DOCUMENT_MIGRATIONS.precision);
  if(!input.planningPeriod)applied.push(DOCUMENT_MIGRATIONS.period);
  if(!input.updatedAt.endsWith("Z"))applied.push(DOCUMENT_MIGRATIONS.updatedAt);
  if(input.employees.some(e=>e.coverageRoleIds === undefined && e.coverageRoles !== undefined))applied.push(DOCUMENT_MIGRATIONS.coverageRoles);
  return {document:migrateCoverageRoles(migratePlanningPeriod(normalizeDocumentTimes(input))),applied};
}
// No time conversion, duration repair, pause insertion or role substitution is allowed here.
export function normalizeDocument(input:EscalaLivreDocument):EscalaLivreDocument {return normalizeRoles(input);}
export function replaceAssignment(document:EscalaLivreDocument,assignment:ShiftAssignment):EscalaLivreDocument {
  return {...document,assignments:[...document.assignments.filter(a=>a.id!==assignment.id),assignment]};
}
