import { AbsenceEditor } from "./AbsenceEditor";
import { EmploymentEditor } from "./EmploymentEditor";
import { useState } from "react";
import { useScheduleStore } from "../store/scheduleStore";
import { previewTeamBatch, previewTeamImport, confirmTeamImport, teamFields, teamTemplate, type TeamField, type TeamPreview, type ImportLine } from "../lib/teamOperations";
import { readTeamFile } from "../lib/teamSpreadsheet";
import { Button } from "./ui";

export function TeamTools(){
 const {document,applyTeamPreview}=useScheduleStore();
 const [selected,setSelected]=useState<string[]>([]),[source,setSource]=useState(""),[fields,setFields]=useState<TeamField[]>([]),[preview,setPreview]=useState<TeamPreview|null>(null);
 const [lines,setLines]=useState<ImportLine[]>([]),[baseline,setBaseline]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const run=(fn:()=>void)=>{try{setError("");fn();}catch(e){setError((e as Error).message);}};
 function confirmImport(){run(()=>{const current=useScheduleStore.getState().document;const next=confirmTeamImport(current,baseline,lines);applyTeamPreview({baseline,document:next,changes:[]});setLines([]);});}
 return <details className="rounded border border-border p-2 space-y-3"><summary>Duplicação, lote e importação</summary><p className="text-xs">Para duplicar, abra uma pessoa e use Duplicar funcionário. Para o lote, escolha as pessoas e somente os campos que deseja substituir.</p>
 <fieldset><legend>Pessoas do lote</legend>{document.employees.map(e=><label className="block" key={e.id}><input type="checkbox" checked={selected.includes(e.id)} onChange={event=>{setPreview(null);setSelected(event.target.checked?[...selected,e.id]:selected.filter(id=>id!==e.id));}} /> {e.name}</label>)}</fieldset>
 <label className="block">Copiar configuração de<select value={source} onChange={e=>{setSource(e.target.value);setPreview(null);}}><option value="">Selecione</option>{document.employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
 <fieldset><legend>Campos a substituir</legend>{teamFields.map(f=><label className="block" key={f.key}><input type="checkbox" checked={fields.includes(f.key)} onChange={e=>{setPreview(null);setFields(e.target.checked?[...fields,f.key]:fields.filter(k=>k!==f.key));}} /> {f.label}</label>)}</fieldset>
 <Button onClick={()=>run(()=>setPreview(previewTeamBatch(document,selected,source,fields)))}>Ver prévia do lote</Button>
 {preview&&<section aria-label="Prévia do lote">{preview.changes.map(c=><div key={c.id}><strong>{c.name}</strong>{c.differences.length?c.differences.map((d,i)=><p className="text-xs break-words" key={i}>{d}</p>):<p>Sem diferenças</p>}</div>)}<Button onClick={()=>run(()=>{applyTeamPreview(preview);setPreview(null);})}>Confirmar lote</Button><Button onClick={()=>setPreview(null)}>Cancelar lote</Button></section>}
 <EmploymentEditor ids={selected} />
 <AbsenceEditor />
 <hr/><h3>Importar equipe</h3><p className="text-xs">Até 2 MiB e 200 pessoas. CSV UTF-8 separado por ponto e vírgula ou XLSX com uma planilha e três colunas: nome, funcao, modelo. Função deve estar cadastrada. Modelo: 5x2, 6x1 ou empresa. Fórmulas são recusadas. Nenhum cadastro existente é sobrescrito.</p>
 <a download="modelo-equipe.csv" href={"data:text/csv;charset=utf-8,"+encodeURIComponent("\uFEFF"+teamTemplate)}>Baixar modelo CSV (também abre no Excel)</a>
 <label className="block">Arquivo de equipe<input type="file" accept=".csv,.xlsx" disabled={busy} onChange={async e=>{const file=e.target.files?.[0];e.target.value="";if(!file)return;setBusy(true);setError("");setLines([]);const base=useScheduleStore.getState().document;try{const rows=await readTeamFile(file);setLines(previewTeamImport(base,rows,()=>crypto.randomUUID()));setBaseline(JSON.stringify(base));}catch(err){setError((err as Error).message);}finally{setBusy(false);}}}/></label>
 {busy&&<p role="status">Lendo arquivo…</p>}
 {lines.length>0&&<section aria-label="Prévia da importação">{lines.map((line,i)=><div key={line.line} className="border-b border-border py-2"><p>Linha {line.line}: {line.values.join(" · ")}</p>{line.employee&&<p className="text-xs">{line.employee.workload.workUnits} dias / {line.employee.workload.restUnits} folgas · máximo {line.employee.workload.weeklyLimitHours}h · contrato {(line.employee.workload.weeklyPlan?.contractedSeconds??0)/3600}h</p>}{line.error&&<p role="alert">{line.error}</p>}<label><input type="checkbox" checked={line.excluded} onChange={e=>setLines(lines.map((l,j)=>j===i?{...l,excluded:e.target.checked}:l))}/> Excluir esta linha</label>{line.duplicate&&<label className="block"><input type="checkbox" checked={line.acknowledged} onChange={e=>setLines(lines.map((l,j)=>j===i?{...l,acknowledged:e.target.checked}:l))}/> Nome repetido: confirme que é outra pessoa</label>}</div>)}<Button onClick={confirmImport}>Confirmar importação</Button><Button onClick={()=>setLines([])}>Cancelar importação</Button></section>}
 {error&&<p role="alert">{error}</p>}
 </details>;
}
