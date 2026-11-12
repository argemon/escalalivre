import { coverageAccumulations } from "../lib/coverageAccumulations";
import { useState } from "react";
import { useScheduleStore } from "../store/scheduleStore";
import { analyzeDocument } from "../lib/analysis";
import type { TeamPreview } from "../lib/teamOperations";
import { Button } from "./ui";
export function CoverageAllocationPanel(){
 const {document,analysis,applyTeamPreview}=useScheduleStore();const [preview,setPreview]=useState<TeamPreview|null>(null),[error,setError]=useState(""),[date,setDate]=useState(document.planningPeriod.start);
 const candidate=preview?analyzeDocument(preview.document):null;
 const accumulations=coverageAccumulations(document,analysis.coverage);
 const dailyAccumulations=accumulations.filter(a=>a.start.slice(0,10)===date);
 return <section aria-label="Mínimos e acumulação de funções">
 {accumulations.length>0&&<p role="status" className="rounded border border-amber-500 bg-amber-500/10 p-2 text-sm">Atenção: {accumulations[0].employeeName} conta ao mesmo tempo como {accumulations[0].roles.join(" e ")} em {accumulations[0].start.slice(0,10)}, das {accumulations[0].start.slice(11)} às {accumulations[0].end.slice(11)}. Cada pessoa continua contando uma única vez no total da equipe. Confira os períodos por dia abaixo.</p>}
 <details className="space-y-2 border border-border rounded p-2"><summary>Cobertura por pessoa · {document.company.coverageMode==="exclusive"?"exclusiva":"simultânea legada"}</summary>
 <p className="text-xs">Substituição autoriza exercer outra função. No modo exclusivo, cada pessoa contribui para uma função por bloco, com alocação que maximiza as demandas atendidas. A equipe conta cada pessoa uma vez. Pausas não contribuem. Um grupo de acumulação ativo limita a contribuição às funções expressamente selecionadas e autorizadas; as outras permissões continuam substituições, sem contribuição enquanto o grupo estiver ativo.</p>
 {!document.company.coverageMode&&<><p className="text-xs">Este arquivo mantém a cobertura simultânea anterior. Revise a prévia antes de converter; os turnos serão preservados.</p><Button type="button" onClick={()=>setPreview({baseline:JSON.stringify(document),document:{...document,company:{...document.company,coverageMode:"exclusive"}},changes:[]})}>Ver prévia de cobertura exclusiva</Button></>}
 {preview&&candidate&&<section aria-label="Prévia de cobertura exclusiva"><p>Cobertura: {Math.round(analysis.coverageScore*100)}% → {Math.round(candidate.coverageScore*100)}%. Blocos com lacunas: {analysis.coverage.filter(b=>b.assigned<b.required).length} → {candidate.coverage.filter(b=>b.assigned<b.required).length}.</p>{candidate.gaps.slice(0,30).map((g,i)=><p className="text-xs" key={i}>{g.start} · {g.role}: faltam {g.missingEmployees}</p>)}{candidate.gaps.length>30&&<p>Mais {candidate.gaps.length-30} lacunas na análise completa.</p>}<Button type="button" onClick={()=>{try{applyTeamPreview(preview);setPreview(null);setError("");}catch(e){setError((e as Error).message);}}}>Confirmar cobertura exclusiva</Button><Button type="button" onClick={()=>setPreview(null)}>Cancelar conversão</Button></section>}
 {dailyAccumulations.slice(0,50).map((a,i)=><p key={i} className="rounded border border-amber-500 p-2 text-sm">{a.start.slice(0,10)} · {a.start.slice(11)}–{a.end.slice(11)}: {a.employeeName} conta ao mesmo tempo como {a.roles.join(" e ")}. É uma pessoa atendendo às funções indicadas.</p>)}
 {dailyAccumulations.length>50&&<p>Mais {dailyAccumulations.length-50} períodos de acumulação neste dia.</p>}
 <label className="block">Dia da contribuição<input type="date" value={date} onChange={e=>setDate(e.target.value)} /></label>
 {analysis.coverage.filter(b=>b.start.slice(0,10)===date).slice(0,100).map((b,i)=><p key={i} className="text-xs">{b.start.slice(11)}–{b.end.slice(11)} · {b.role}: {b.assigned}/{b.required} · {b.employeeIds?b.employeeIds.map(id=>document.employees.find(e=>e.id===id)?.name??id).join(", ")||"ninguém alocado":"presença simultânea legada"}</p>)}
 {analysis.coverage.filter(b=>b.start.slice(0,10)===date).length>100&&<p>Mostrando os primeiros 100 blocos do dia; o resultado completo mantém todas as contribuições.</p>}{error&&<p role="alert">{error}</p>}
 </details></section>;
}
