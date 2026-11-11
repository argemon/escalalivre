import type { EscalaLivreDocument, ShiftAssignment } from "../types/schedule";
import { civilMillis, civilString, civilWeek } from "./civilTime";
import { employeeOn, activeOn } from "./policies/employment";
import { canCover } from "./coverageAllocation";
import { accumulationAllows } from "./exclusiveAllocation";
import { previewPlanning } from "./planningEdits";
import { periodError } from "./planningPeriod";
export const civilWeekPeriod=(date:string)=>{const at=civilWeek(civilMillis(date+"T00:00:00"));return {start:civilString(at).slice(0,10),end:civilString(at+6*86400000).slice(0,10)};};
export type CopyChoice={mode:"skip"|"replace";replaceIds:string[]};
export function copyWeekRows(d:EscalaLivreDocument,sourceDate:string,targetDate:string,people:string[],copyPins:boolean,newId:()=>string=()=>crypto.randomUUID()){
 const source=civilWeekPeriod(sourceDate),target=civilWeekPeriod(targetDate),error=periodError(source)||periodError(target);if(error)throw Error(error);
 if(people.some(id=>!d.employees.some(e=>e.id===id)))throw Error("Pessoa não encontrada.");
 const delta=civilMillis(target.start+"T00:00:00")-civilMillis(source.start+"T00:00:00");
 const move=(value:string)=>civilString(civilMillis(value)+delta);
 return d.assignments.filter(a=>people.includes(a.employeeId)&&a.start.slice(0,10)>=source.start&&a.start.slice(0,10)<=source.end).map(old=>{
  const start=move(old.start),employee=employeeOn(d.employees.find(e=>e.id===old.employeeId)!,start);
  const assignment:ShiftAssignment={...structuredClone(old),id:newId(),start,end:move(old.end),break:old.break?{start:move(old.break.start),end:move(old.break.end)}:undefined,role:employee.role,roleId:employee.roleId,pinned:copyPins?old.pinned:undefined,tags:old.tags.filter(t=>!t.startsWith("holiday:"))};
  const collisions=d.assignments.filter(a=>a.employeeId===assignment.employeeId&&(a.start.slice(0,10)===assignment.start.slice(0,10)||(civilMillis(a.start)<civilMillis(assignment.end)&&civilMillis(assignment.start)<civilMillis(a.end))));
  return {source:old,assignment,collisions,active:activeOn(employee,start)};
 });
}
export function previewWeekCopy(d:EscalaLivreDocument,sourceDate:string,targetDate:string,people:string[],copyPins:boolean,choices:Record<string,CopyChoice>={},newId?:()=>string){
 if(!people.length)throw Error("Selecione as pessoas da cópia.");
 const rows=copyWeekRows(d,sourceDate,targetDate,people,copyPins,newId),remove=new Set<string>(),added:ShiftAssignment[]=[],selected:typeof rows=[];
 for(const row of rows){const choice=choices[row.source.id];if(choice?.mode==="skip")continue;
  if(row.collisions.length){if(choice?.mode!=="replace"||row.collisions.some(a=>!choice.replaceIds.includes(a.id)))throw Error("Há colisões no destino. Pule o item ou marque os turnos a substituir.");if(choice.replaceIds.some(id=>!row.collisions.some(a=>a.id===id)))throw Error("A substituição contém turno não listado na colisão.");if(row.collisions.some(a=>a.pinned))throw Error("Desafixe explicitamente os turnos do destino antes de substituí-los.");for(const id of choice.replaceIds)remove.add(id);}
  if(added.some(a=>a.employeeId===row.assignment.employeeId&&(a.start.slice(0,10)===row.assignment.start.slice(0,10)||(civilMillis(a.start)<civilMillis(row.assignment.end)&&civilMillis(row.assignment.start)<civilMillis(a.end)))))throw Error("As cópias selecionadas colidem entre si. Pule os itens conflitantes.");
  added.push(row.assignment);selected.push(row);
 }
 const next={...d,planningPeriod:civilWeekPeriod(targetDate),assignments:[...d.assignments.filter(a=>!remove.has(a.id)),...added]};
 return {...previewPlanning(d,next,"Copiar semana e selecionar destino"),requireDraftAcknowledgement:true,rows:selected,skipped:rows.length-selected.length,copyPins,removedIds:[...remove]};
}
export function previewSwap(d:EscalaLivreDocument,firstId:string,secondId:string){
 const a=d.assignments.find(a=>a.id===firstId),b=d.assignments.find(a=>a.id===secondId);
 if(!a||!b||a.id===b.id||a.employeeId===b.employeeId)throw Error("Escolha dois turnos de pessoas diferentes.");
 if(a.pinned||b.pinned)throw Error("Desafixe explicitamente os dois turnos antes de trocar responsáveis.");
 if([a,b].some(a=>a.start.slice(0,10)<d.planningPeriod.start||a.start.slice(0,10)>d.planningPeriod.end))throw Error("Selecione um período que inclua os dois turnos.");
 function transfer(shift:ShiftAssignment,person:string){const e=employeeOn(d.employees.find(e=>e.id===person)!,shift.start),r={role:shift.role,roleId:shift.roleId,day:0,start:"00:00:00",end:"01:00:00",minimumEmployees:1};if(!activeOn(e,shift.start)||!canCover(e,r,d.roles)||(d.company.coverageMode==="exclusive"&&e.accumulationRoleIds?.length&&!accumulationAllows(e,r,d.roles)))throw Error("A função ou atividade do destino não permite esta troca.");return {...shift,employeeId:e.id,role:e.role,roleId:e.roleId};}
 const first=transfer(a,b.employeeId),second=transfer(b,a.employeeId),next={...d,assignments:d.assignments.map(s=>s.id===a.id?first:s.id===b.id?second:s)};
 const preview=previewPlanning(d,next,"Trocar responsáveis dos dois turnos"),people=new Set([a.employeeId,b.employeeId]);
 const errors=preview.analysis.conflicts.filter(c=>c.severity==="error"&&c.employeeId&&people.has(c.employeeId));if(errors.length)throw Error("Troca bloqueada: as duas pessoas devem ficar sem conflitos obrigatórios. "+errors.slice(0,5).map(c=>c.message).join(" "));
 return {...preview,requireDraftAcknowledgement:true,swaps:[{before:a,after:first},{before:b,after:second}]};
}
