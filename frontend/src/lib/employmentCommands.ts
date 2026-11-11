import type { EscalaLivreDocument } from "../types/schedule";
import { documentSchema } from "./documentSchema";
import { employeeOn } from "./policies/employment";
import type { TeamPreview } from "./teamOperations";
export function previewEmployment(document:EscalaLivreDocument,ids:string[],startsOn:string,roleId:string|undefined,inactivate:boolean,updateFuture:boolean):TeamPreview{
 if(!ids.length || !/^\d{4}-\d{2}-\d{2}$/.test(startsOn))throw Error("Escolha pessoas e uma data civil válida.");
 const role=document.roles?.find(r=>r.id===roleId);if(!inactivate&&!role)throw Error("Selecione uma função cadastrada.");
 const changes:TeamPreview["changes"]=[];
 const employees=document.employees.map(e=>{
  if(!ids.includes(e.id))return e;
  const future=document.assignments.filter(a=>a.employeeId===e.id&&a.start.slice(0,10)>=startsOn);
  const nextHistory=[...(e.roleHistory??[]).filter(t=>t.startsOn!==startsOn),{startsOn,roleId:role?.id??e.roleId!,role:role?.name??e.role,coverageRoleIds:[...(employeeOn(e,startsOn).coverageRoleIds??[])]}].sort((a,b)=>a.startsOn.localeCompare(b.startsOn));
  const differences=[inactivate?"Inativo a partir de "+startsOn:"Nova função a partir de "+startsOn+": "+role!.name,...future.map(a=>a.start+": "+a.role+" → "+(inactivate?"preservado, com alerta de inatividade":updateFuture?employeeOn({...e,roleHistory:nextHistory},a.start).role:"preservado; revisar divergência"))];
  changes.push({id:e.id,name:e.name,differences});
  return inactivate?{...e,inactiveFrom:startsOn}:{...e,roleHistory:nextHistory};
 });
 if(changes.length!==new Set(ids).size)throw Error("Pessoa não encontrada.");
 const assignments=!inactivate&&updateFuture?document.assignments.map(a=>{if(!ids.includes(a.employeeId)||a.start.slice(0,10)<startsOn)return a;const e=employeeOn(employees.find(e=>e.id===a.employeeId)!,a.start);return {...a,role:e.role,roleId:e.roleId};}):document.assignments;
 const next={...document,employees,assignments};const result=documentSchema.safeParse(next);if(!result.success)throw Error(result.error.issues[0].message);
 return {baseline:JSON.stringify(document),document:next,changes};
}
export function confirmEmployment(current:EscalaLivreDocument,preview:TeamPreview):EscalaLivreDocument {
 if(JSON.stringify(current)!==preview.baseline)throw Error("Documento alterado. Refaça a prévia.");
 const result=documentSchema.safeParse(preview.document);if(!result.success)throw Error(result.error.issues[0].message);return structuredClone(preview.document);
}
