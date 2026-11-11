import type { EscalaLivreDocument, ShiftAssignment, CoverageGap, ScheduleResult, CoverageRequirement } from "../types/schedule";
import { analyzeDocument } from "./analysis";
import { employeeOn, activeOn } from "./policies/employment";
import { canCover } from "./coverageAllocation";
import { accumulationAllows } from "./exclusiveAllocation";
import { civilMillis, civilString, civilDay, clockMillis } from "./civilTime";
import { desiredWorkSeconds } from "./policies/contractWorkTargets";
import { intervalForCivil } from "./intervals";
import { previewPlanning } from "./planningEdits";
const deficit=(result:ScheduleResult,g:CoverageGap)=>result.coverage.filter(b=>b.role===g.role).reduce((n,b)=>n+Math.max(0,b.required-b.assigned)*Math.max(0,Math.min(civilMillis(b.end),civilMillis(g.end))-Math.max(civilMillis(b.start),civilMillis(g.start))),0);
export function previewGapAssignment(d:EscalaLivreDocument,assignment:ShiftAssignment){const p=previewPlanning(d,{...d,assignments:[...d.assignments,assignment]},"Alocar turno para reduzir lacuna");const errors=p.analysis.conflicts.filter(c=>c.severity==="error"&&c.employeeId===assignment.employeeId);if(errors.length)throw Error(errors.slice(0,5).map(c=>c.message).join(" "));return p;}
export function gapCandidates(d:EscalaLivreDocument,gap:CoverageGap){
 const before=deficit(analyzeDocument(d),gap),base=civilDay(civilMillis(gap.start));return d.employees.map(person=>{
  const e=employeeOn(person,gap.start);const r:CoverageRequirement={scope:d.company.coverage.find(c=>c.role===gap.role)?.scope??"role",role:gap.role,roleId:gap.roleId??d.roles?.find(r=>r.name===gap.role)?.id,day:0,start:"00:00:00",end:"01:00:00",minimumEmployees:1};let reason="Nenhuma janela proposta ficou viável.";
  if(!activeOn(e,gap.start))return {id:e.id,name:e.name,eligible:false,reason:"Pessoa inativa na data da lacuna."};
  if(!canCover(e,r,d.roles)||(r.scope!=="team"&&d.company.coverageMode==="exclusive"&&e.accumulationRoleIds?.length&&!accumulationAllows(e,r,d.roles)))return {id:e.id,name:e.name,eligible:false,reason:"Sem autorização ou grupo ativo para a função da lacuna."};
  const entry=clockMillis(e.shiftStartsAt??d.company.opensAt),starts=[civilMillis(gap.start),base+entry,base-86400000+entry];
  for(const at of [...new Set(starts)]){const start=civilString(at),effective=employeeOn(person,start),work=desiredWorkSeconds(d.company,effective,start.slice(0,10));if(work<=0)continue;for(const pause of [...new Set([clockMillis(d.company.lunch.minimum),0,900000,3600000,7200000])]){const end=civilString(at+work*1000+pause);if(civilMillis(end)<=civilMillis(gap.start)||at>=civilMillis(gap.end))continue;const a:ShiftAssignment={id:crypto.randomUUID(),employeeId:e.id,role:effective.role,roleId:effective.roleId,start,end,break:intervalForCivil(d.company,effective,start,end,pause/60000),source:"manual",tags:[]};try{const p=previewGapAssignment(d,a);if(deficit(p.analysis,gap)<before)return {id:e.id,name:e.name,eligible:true,reason:"Turno válido que reduz esta lacuna; confira cobertura restante e intervalo na prévia.",assignment:a,coverage:p.analysis.coverageScore};reason="O turno válido não reduz a lacuna com a alocação exclusiva atual.";}catch(error){reason=(error as Error).message;}}}
  return {id:e.id,name:e.name,eligible:false,reason};
 });
}
