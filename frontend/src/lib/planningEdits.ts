import type { EscalaLivreDocument, ScheduleResult, ShiftAssignment } from "../types/schedule";
import { documentSchema } from "./documentSchema";
import { analyzeDocument } from "./analysis";
import { activeOn } from "./policies/employment";
export type PlanningPreview={baseline:string;document:EscalaLivreDocument;analysis:ScheduleResult;label:string;requireDraftAcknowledgement?:boolean};
export function previewPlanning(document:EscalaLivreDocument,next:EscalaLivreDocument,label:string):PlanningPreview {
 if(next.id!==document.id)throw Error("A operação pertence a outro planejamento.");
 const parsed=documentSchema.safeParse(next);if(!parsed.success)throw Error("Estrutura inválida: "+parsed.error.issues[0].message);
 for(const a of next.assignments){const old=document.assignments.find(v=>v.id===a.id);const e=next.employees.find(e=>e.id===a.employeeId)!;if((!old||old.employeeId!==a.employeeId||old.start.slice(0,10)!==a.start.slice(0,10))&&!activeOn(e,a.start))throw Error("Pessoa inativa na data inicial do novo turno.");}
 return {baseline:JSON.stringify(document),document:structuredClone(next),analysis:analyzeDocument(next),label};
}
export function previewShift(document:EscalaLivreDocument,assignment:ShiftAssignment|undefined,removeId?:string):PlanningPreview{
 if(removeId&&!document.assignments.some(a=>a.id===removeId))throw Error("Turno não encontrado.");
 const assignments=assignment?[...document.assignments.filter(a=>a.id!==assignment.id),structuredClone(assignment)]:document.assignments.filter(a=>a.id!==removeId);
 return previewPlanning(document,{...document,assignments},assignment?"Salvar turno":"Remover turno");
}
export function confirmPlanning(current:EscalaLivreDocument,preview:PlanningPreview,allowDraft:boolean):EscalaLivreDocument{
 if(JSON.stringify(current)!==preview.baseline)throw Error("O planejamento mudou. Refaça a prévia.");
 const checked=previewPlanning(current,preview.document,preview.label);
 if(preview.requireDraftAcknowledgement&&!allowDraft&&(checked.analysis.conflicts.length>0||checked.analysis.gaps.length>0))throw Error("Reconheça explicitamente as pendências da cópia ou troca antes de manter o rascunho.");
 if(!allowDraft&&checked.analysis.conflicts.some(c=>c.severity==="error"))throw Error("Confira os conflitos e autorize manter o rascunho.");
 return checked.document;
}
