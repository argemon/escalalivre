import type { AbsenceEvent, EscalaLivreDocument, ShiftAssignment } from "../types/schedule";
import { civilMillis, civilString, civilDay } from "./civilTime";
import { nominalSeconds } from "./policies/contractWorkTargets";
import { employeeOn, activeOn } from "./policies/employment";
import { isAvailable } from "./policies/availability";
import { canCover } from "./coverageAllocation";
import { accumulationAllows } from "./exclusiveAllocation";
import { previewPlanning } from "./planningEdits";
export const absenceCategories={vacation:"Férias",medical:"Atestado",leave:"Licença",unavailable:"Indisponibilidade"};
export function inclusiveAbsenceWindow(from:string,through:string){return {start:from+"T00:00:00",end:civilString(civilMillis(through+"T00:00:00")+86400000)};}
export function absenceDates(start:string,end:string):string[]{const days:string[]=[];for(let at=civilDay(civilMillis(start));at<civilMillis(end)&&days.length<=366;at+=86400000)days.push(civilString(at).slice(0,10));return days;}
export const affectedShifts=(d:EscalaLivreDocument,employeeId:string,a:Pick<AbsenceEvent,"start"|"end">)=>d.assignments.filter(s=>s.employeeId===employeeId&&civilMillis(s.start)<civilMillis(a.end)&&civilMillis(a.start)<civilMillis(s.end));
function withAbsence(d:EscalaLivreDocument,owner:string,event:AbsenceEvent|undefined,removeId?:string):EscalaLivreDocument{
 const e=d.employees.find(e=>e.id===owner);if(!e)throw Error("Pessoa não encontrada.");
 if(event)for(const credit of event.credits)if(credit.excusedSeconds>nominalSeconds(d.company,e,credit.date))throw Error("Dispensa acima da carga prevista em "+credit.date+". Informe a quantidade líquida explícita ou deixe sem dispensa.");
 return {...d,employees:d.employees.map(e=>e.id!==owner?e:{...e,absences:event?[...(e.absences??[]).filter(a=>a.id!==event.id),structuredClone(event)]:(e.absences??[]).filter(a=>a.id!==removeId)})};
}
function replacement(d:EscalaLivreDocument,shift:ShiftAssignment,candidateId:string):ShiftAssignment{
 if(shift.pinned)throw Error("Desafixe o turno no editor antes de substituí-lo.");
 const registered=d.employees.find(e=>e.id===candidateId);if(!registered||candidateId===shift.employeeId)throw Error("Escolha outra pessoa.");
 const e=employeeOn(registered,shift.start),requirement={role:shift.role,roleId:shift.roleId,day:0,start:"00:00:00",end:"01:00:00",minimumEmployees:1};
 if(!activeOn(e,shift.start))throw Error("Pessoa inativa na data do turno.");
 if(!canCover(e,requirement,d.roles))throw Error("Sem autorização para substituir a função atingida.");
 if(d.company.coverageMode==="exclusive"&&e.accumulationRoleIds?.length&&!accumulationAllows(e,requirement,d.roles))throw Error("O grupo de acumulação ativo não inclui a função atingida.");
 if(!isAvailable(e,civilMillis(shift.start),civilMillis(shift.end)))throw Error("Indisponível: confira ausências, bloqueios e disponibilidade.");
 return {...shift,employeeId:e.id,role:e.role,roleId:e.roleId};
}
export function previewAbsence(d:EscalaLivreDocument,owner:string,event:AbsenceEvent|undefined,treatments:Record<string,string>={},removeId?:string){
 const next=withAbsence(d,owner,event,removeId),affected=event?affectedShifts(d,owner,event):[],ids=new Set(affected.map(a=>a.id)),substitutes=new Set<string>();
 const assignments:ShiftAssignment[]=[];
 for(const a of next.assignments){const treatment=ids.has(a.id)?treatments[a.id]:undefined;if(!treatment||treatment==="keep"){assignments.push(a);continue;}if(a.pinned)throw Error("Turno fixado: mantenha-o ou desafixe explicitamente no editor antes de tratar a ausência.");if(treatment==="remove")continue;const value=replacement(next,a,treatment);substitutes.add(value.employeeId);assignments.push(value);}
 const preview=previewPlanning(d,{...next,assignments},event?"Registrar ausência e tratamentos":"Remover ausência");
 const errors=preview.analysis.conflicts.filter(c=>c.severity==="error"&&c.employeeId&&substitutes.has(c.employeeId));if(errors.length)throw Error("Substituição inviável na proposta inteira: "+errors.slice(0,5).map(c=>c.message).join(" "));
 return {...preview,affected};
}
export function absenceCandidates(d:EscalaLivreDocument,owner:string,event:AbsenceEvent,shiftId:string){
 const shift=affectedShifts(d,owner,event).find(a=>a.id===shiftId);if(!shift)throw Error("Turno não atingido pela ausência.");
 return d.employees.filter(e=>e.id!==owner).map(e=>{try{const preview=previewAbsence(d,owner,event,{[shift.id]:e.id});return {id:e.id,name:e.name,eligible:true,reasons:["Autorizado para "+shift.role+" na data do turno; atividade, disponibilidade, descanso e jornada conferidos na proposta inteira."],coverage:preview.analysis.coverageScore};}catch(error){return {id:e.id,name:e.name,eligible:false,reasons:[(error as Error).message],coverage:undefined};}});
}

export function previewSubstitution(d:EscalaLivreDocument,shiftId:string,candidateId:string){const shift=d.assignments.find(a=>a.id===shiftId);if(!shift)throw Error("Turno não encontrado.");const next=replacement(d,shift,candidateId),preview=previewPlanning(d,{...d,assignments:d.assignments.map(a=>a.id===shiftId?next:a)},"Substituir responsável do turno");const errors=preview.analysis.conflicts.filter(c=>c.severity==="error"&&c.employeeId===candidateId);if(errors.length)throw Error(errors.slice(0,5).map(c=>c.message).join(" "));return preview;}
export function replacementCandidates(d:EscalaLivreDocument,shiftId:string){const old=d.assignments.find(a=>a.id===shiftId);if(!old)throw Error("Turno não encontrado.");return d.employees.filter(e=>e.id!==old.employeeId).map(e=>{try{const p=previewSubstitution(d,shiftId,e.id);return {id:e.id,name:e.name,eligible:true,reason:"Atividade, autorização, disponibilidade, descanso e carga conferidos.",coverage:p.analysis.coverageScore};}catch(error){return {id:e.id,name:e.name,eligible:false,reason:(error as Error).message,coverage:undefined};}});}
