import type { EscalaLivreDocument, ScheduleResult, ShiftAssignment } from "../types/schedule";
import { normalizeResultTimes } from "./dateTime";
import { periodError, type PlanningPeriod } from "./planningPeriod";
import { belongsToPeriod, replacePeriodAssignments } from "./scheduleWindow";
import { previewPlanning } from "./planningEdits";
const canonical=(a:ShiftAssignment)=>JSON.stringify({...a,break:a.break??null},(_key,value)=>value&&typeof value==="object"&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value);
export function generationProposal(document:EscalaLivreDocument,result:ScheduleResult,range:PlanningPeriod=document.planningPeriod){
 const error=periodError(range);if(error||range.start<document.planningPeriod.start||range.end>document.planningPeriod.end)throw Error(error??"O recorte precisa estar dentro do período selecionado.");
 result=normalizeResultTimes(result,document.company.timeZone);
 result={...result,assignments:result.assignments.map(a=>({...a,pinned:a.pinned??undefined}))};
 if(!["optimal","feasible"].includes(result.optimization?.status??"not-run")||result.conflicts.some(c=>["solverInfeasible","solverTimeout","solverInvalid"].includes(c.code)))throw Error("A geração não encontrou proposta admissível. Os turnos foram mantidos. "+result.conflicts.filter(c=>c.severity==="error").slice(0,5).map(c=>c.message).join(" "));
 for(const old of document.assignments.filter(a=>a.pinned&&belongsToPeriod(a,range))){const proposed=result.assignments.find(a=>a.id===old.id);if(!proposed||canonical(old)!==canonical(proposed))throw Error("A proposta não preserva integralmente um turno fixado.");}
 const assignments=replacePeriodAssignments({...document,planningPeriod:range},result.assignments);
 const preview=previewPlanning(document,{...document,assignments},"Aplicar proposta de geração");
 const changes={added:assignments.filter(a=>!document.assignments.some(old=>old.id===a.id)),removed:document.assignments.filter(old=>!assignments.some(a=>a.id===old.id)),changed:assignments.filter(a=>{const old=document.assignments.find(old=>old.id===a.id);return old&&canonical(old)!==canonical(a);})};
 return {...preview,document:{...preview.document,assignments},changes,range};
}
