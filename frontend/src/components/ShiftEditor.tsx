import { useDialogFocus } from "../lib/useDialogFocus";
import { useRef, useState } from "react";
import { useScheduleStore } from "../store/scheduleStore";
import { previewShift, type PlanningPreview } from "../lib/planningEdits";
import { employeeOn } from "../lib/policies/employment";
import { civilMillis, civilString, clockMillis } from "../lib/civilTime";
import type { ShiftAssignment } from "../types/schedule";
import { Button } from "./ui";
export function ShiftEditor(){
 const {document,selectedShift}=useScheduleStore();if(!selectedShift)return null;
 const existing=document.assignments.find(a=>a.id===selectedShift.id),employee=document.employees.find(e=>e.id===selectedShift.employeeId)??document.employees[0];if(!employee)return null;
 const start=selectedShift.date+"T"+document.company.opensAt,effective=employeeOn(employee,start);
 const initial:ShiftAssignment=selectedShift.draft??existing??{id:crypto.randomUUID(),employeeId:employee.id,role:effective.role,roleId:effective.roleId,start,end:civilString(civilMillis(start)+clockMillis((employee.inheritsCompanyDefaults?document.company.defaultWorkload:employee.workload).defaultShiftDuration)),source:"manual",tags:[]};
 return <ShiftForm key={selectedShift.id??selectedShift.employeeId+selectedShift.date} initial={initial} />;
}
function ShiftForm({initial}:{initial:ShiftAssignment}){
 const {document,analysis,selectShift,applyPlanningPreview,setSelectedEmployeeId}=useScheduleStore();const [draft,setDraft]=useState(initial),[preview,setPreview]=useState<PlanningPreview|null>(null),[allow,setAllow]=useState(false),[error,setError]=useState("");
 const patch=(change:Partial<ShiftAssignment>)=>{setDraft({...draft,...change});setPreview(null);setAllow(false);};const run=(fn:()=>void)=>{try{setError("");fn();}catch(e){setError((e as Error).message);}};
 const dialogRef=useRef<HTMLElement>(null);useDialogFocus(dialogRef,()=>selectShift(undefined));
 const stamp=(v:string)=>v.length===16?v+":00":v;
 return <div className="absolute inset-0 z-40 flex justify-end bg-black/40"><aside ref={dialogRef} role="dialog" aria-modal="true" aria-label="Editar turno" className="w-full max-w-lg overflow-auto bg-card p-5 space-y-3" onKeyDown={e=>{if(e.key==="Escape")selectShift(undefined);}}><h2 className="text-xl">Turno salvo ou novo turno</h2>
 <label className="block">Pessoa do turno<select value={draft.employeeId} onChange={event=>{const e=employeeOn(document.employees.find(e=>e.id===event.target.value)!,draft.start);patch({employeeId:e.id,role:e.role,roleId:e.roleId});}}>{document.employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
 {(["start","end"]as const).map(k=><label className="block" key={k}>{k==="start"?"Entrada do turno":"Saída do turno"}<input type="datetime-local" step="1" value={draft[k]} onChange={e=>patch({[k]:stamp(e.target.value)})}/></label>)}
 <label className="block">Função exercida<select value={draft.roleId??""} onChange={e=>{const role=document.roles?.find(r=>r.id===e.target.value);patch({roleId:role?.id,role:role?.name??""});}}>{document.roles?.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
 <label className="block"><input type="checkbox" checked={Boolean(draft.break)} onChange={e=>patch({break:e.target.checked?{start:draft.start.slice(0,10)+"T12:00:00",end:draft.start.slice(0,10)+"T13:00:00"}:undefined})}/> Incluir intervalo</label>
 {draft.break&&(["start","end"]as const).map(k=><label className="block" key={k}>{k==="start"?"Início da pausa":"Fim da pausa"}<input type="datetime-local" step="1" value={draft.break![k]} onChange={e=>patch({break:{...draft.break!,[k]:stamp(e.target.value)}})}/></label>)}
 <label className="block"><input type="checkbox" checked={draft.pinned??false} onChange={e=>patch({pinned:e.target.checked})}/> Fixar este turno na geração</label>
 <p className="text-xs">Horários civis com segundos. A saída e a pausa podem estar no dia seguinte. Nada será ajustado automaticamente. Origem e anotações existentes são preservadas.</p>
 <Button type="button" onClick={()=>run(()=>setPreview(previewShift(document,draft)))}>Conferir turno</Button>{document.assignments.some(a=>a.id===draft.id)&&<Button type="button" onClick={()=>run(()=>setPreview(previewShift(document,undefined,draft.id)))}>Conferir remoção</Button>}
 {preview&&<section aria-label="Impacto do turno"><p>Cobertura: {Math.round(analysis.coverageScore*100)}% → {Math.round(preview.analysis.coverageScore*100)}% · Conflitos: {analysis.conflicts.filter(c=>c.severity==="error").length} → {preview.analysis.conflicts.filter(c=>c.severity==="error").length}</p><p>Horas planejadas: {analysis.workloads?.reduce((n,w)=>n+w.plannedSeconds,0)??"sem contrato"} → {preview.analysis.workloads?.reduce((n,w)=>n+w.plannedSeconds,0)??"sem contrato"} (segundos líquidos)</p>{preview.analysis.conflicts.filter(c=>c.employeeId===draft.employeeId).slice(0,30).map((c,i)=><p className="text-xs" key={i}>{c.message}<details><summary>Detalhes técnicos</summary>{c.code}</details></p>)}{preview.analysis.conflicts.some(c=>c.severity==="error")&&<label className="block"><input type="checkbox" checked={allow} onChange={e=>setAllow(e.target.checked)}/> Manter explicitamente como rascunho com os conflitos indicados</label>}<Button type="button" onClick={()=>run(()=>applyPlanningPreview(preview,allow))}>Confirmar alteração do turno</Button></section>}
 {error&&<p role="alert">{error}</p>}<Button type="button" onClick={()=>selectShift(undefined)}>Cancelar turno</Button><Button type="button" onClick={()=>setSelectedEmployeeId(draft.employeeId)}>Editar cadastro da pessoa</Button></aside></div>;
}
