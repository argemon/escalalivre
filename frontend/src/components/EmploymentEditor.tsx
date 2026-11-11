import { useState } from "react";
import { useScheduleStore } from "../store/scheduleStore";
import { previewEmployment } from "../lib/employmentCommands";
import type { TeamPreview } from "../lib/teamOperations";
import { Button } from "./ui";
export function EmploymentEditor({ids}:{ids:string[]}){
 const {document,applyEmploymentPreview}=useScheduleStore();const [date,setDate]=useState(document.planningPeriod.start),[role,setRole]=useState(""),[inactive,setInactive]=useState(false),[update,setUpdate]=useState(false),[preview,setPreview]=useState<TeamPreview|null>(null),[error,setError]=useState("");
 const run=(action:()=>void)=>{try{setError("");action();}catch(e){setError((e as Error).message);}};
 const reset=()=>setPreview(null);
 return <section className="space-y-2 border border-border rounded p-2"><h3>Função e inativação com vigência</h3><p className="text-xs">O cadastro guarda a função de origem. Mudanças abaixo entram em vigor pela data inicial de cada turno. Turnos anteriores e turnos futuros não selecionados são preservados. Inativar conserva o histórico e sinaliza turnos futuros; a exclusão definitiva remove o cadastro e seus turnos.</p>
 <label className="block">Vigência<input type="date" value={date} onChange={e=>{setDate(e.target.value);reset();}} /></label>
 <label className="block"><input type="checkbox" checked={inactive} onChange={e=>{setInactive(e.target.checked);reset();}}/> Inativar a partir desta data</label>
 {!inactive&&<><label className="block">Nova função<select value={role} onChange={e=>{setRole(e.target.value);reset();}}><option value="">Selecione</option>{document.roles?.map(r=><option value={r.id} key={r.id}>{r.name}</option>)}</select></label><label className="block"><input type="checkbox" checked={update} onChange={e=>{setUpdate(e.target.checked);reset();}}/> Adequar explicitamente os turnos salvos a partir da vigência</label></>}
 <Button type="button" onClick={()=>run(()=>setPreview(previewEmployment(document,ids,date,role||undefined,inactive,update)))}>Conferir alteração de vigência</Button>
 {preview&&<div aria-label="Prévia de vigência">{preview.changes.map(c=><article key={c.id}><strong>{c.name}</strong>{c.differences.map((d,i)=><p key={i} className="text-xs">{d}</p>)}</article>)}<Button type="button" onClick={()=>run(()=>{applyEmploymentPreview(preview);setPreview(null);})}>Confirmar vigência</Button><Button type="button" onClick={reset}>Cancelar vigência</Button></div>}
 {error&&<p role="alert">{error}</p>}
 </section>;
}
