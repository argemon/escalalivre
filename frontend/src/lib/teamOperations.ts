import type { Employee, EscalaLivreDocument } from "../types/schedule";
import { employeeOn } from "./policies/employment";
import { documentSchema } from "./documentSchema";
import { selectEmployeePattern } from "./policies/employeeSchedule";

export const priorities = [{label:"Baixa",weight:1},{label:"Média",weight:5},{label:"Alta",weight:10}];
export type TeamField = "workload" | "allowsOvertime" | "allowsNightWork" | "shiftStartsAt" | "preferences" | "coverageRoleIds";
export const teamFields: {key:TeamField;label:string}[] = [{key:"workload",label:"Jornada, dias, intervalo, trabalho no fechamento e folgas preferidas"},{key:"allowsOvertime",label:"Permissão de extras"},{key:"allowsNightWork",label:"Trabalho noturno"},{key:"shiftStartsAt",label:"Entrada fixa"},{key:"preferences",label:"Preferências recorrentes"},{key:"coverageRoleIds",label:"Substituições individuais"}];
// Explicit allowlist: dated and future personal fields are never copied accidentally.
export function duplicateEmployee(e:Employee,id:string,name:string):Employee {
 if(!name.trim() || !id || id===e.id)throw Error("Informe novo nome e identidade.");
 return structuredClone({id,name:name.trim(),role:e.role,roleId:e.roleId,inheritsCompanyDefaults:e.inheritsCompanyDefaults,workload:e.workload,
  accumulationRoleIds:e.accumulationRoleIds,workingDays:e.workingDays,coverageRoleIds:e.coverageRoleIds,preferences:e.preferences,preferredDaysOff:e.preferredDaysOff,
  allowsOvertime:e.allowsOvertime,allowsNightWork:e.allowsNightWork,shiftStartsAt:e.shiftStartsAt,fixedInterval:e.fixedInterval,
  worksDuringLunchClosure:e.worksDuringLunchClosure,availability:[],restrictions:[]});
}
export type TeamPreview = {baseline:string;document:EscalaLivreDocument;changes:{id:string;name:string;differences:string[]}[]};
export function previewTeamBatch(document:EscalaLivreDocument,ids:string[],sourceId:string,fields:TeamField[]):TeamPreview {
 if(!ids.length || !fields.length)throw Error("Selecione pessoas e campos.");
 if(fields.some(k=>!teamFields.some(f=>f.key===k)))throw Error("Campo não permitido em lote.");
 const source=document.employees.find(e=>e.id===sourceId);
 if(!source || ids.some(id=>!document.employees.some(e=>e.id===id)))throw Error("Cadastro não encontrado.");
 const changes:TeamPreview["changes"]=[];
 const employees=document.employees.map(e=>{
  if(!ids.includes(e.id))return e;
  const next={...e};const differences:string[]=[];
  for(const key of fields){
   if(key==="coverageRoleIds"){const grants=employeeOn(source,document.planningPeriod.start).coverageRoleIds;const tenure=e.roleHistory?.filter(t=>t.startsOn<=document.planningPeriod.start).sort((a,b)=>b.startsOn.localeCompare(a.startsOn))[0];differences.push("Permissões individuais: "+JSON.stringify(employeeOn(e,document.planningPeriod.start).coverageRoleIds)+" → "+JSON.stringify(grants));if(tenure)next.roleHistory=e.roleHistory!.map(t=>t.startsOn===tenure.startsOn?{...t,coverageRoleIds:structuredClone(grants)}:t);else next.coverageRoleIds=structuredClone(grants);continue;}
   const keys=key==="workload"?["workload","inheritsCompanyDefaults","workingDays","fixedInterval","worksDuringLunchClosure","preferredDaysOff"] as const:[key];
   for(const k of keys){if(JSON.stringify(e[k])!==JSON.stringify(source[k]))differences.push(k+": "+JSON.stringify(e[k])+" → "+JSON.stringify(source[k]));Object.assign(next,{[k]:structuredClone(source[k])});}
  }
  changes.push({id:e.id,name:e.name,differences});return next;
 });
 const next={...document,employees};const result=documentSchema.safeParse(next);
 if(!result.success)throw Error(result.error.issues[0].message);
 return {baseline:JSON.stringify(document),document:next,changes};
}
export function confirmTeamPreview(current:EscalaLivreDocument,preview:TeamPreview):EscalaLivreDocument {
 if(JSON.stringify(current)!==preview.baseline)throw Error("O documento mudou. Gere uma nova prévia.");
 const result=documentSchema.safeParse(preview.document);if(!result.success)throw Error(result.error.issues[0].message);
 // Configuration operations never write assignments, even through a modified preview.
 if(JSON.stringify(current.assignments)!==JSON.stringify(preview.document.assignments))throw Error("A prévia não pode alterar turnos.");
 return structuredClone(preview.document);
}
export const importLimits={bytes:2*1024*1024,rows:200,columns:3};
export const teamTemplate="nome;funcao;modelo\r\nPessoa exemplo;Atendente;5x2\r\n";
export function parseTeamCsv(text:string):string[][] {
 if(new TextEncoder().encode(text).length>importLimits.bytes)throw Error("Arquivo acima de 2 MiB.");
 const rows:string[][]=[];let row:string[]=[],cell="",quoted=false,closed=false;
 text=text.replace(/^\uFEFF/,"");
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
  if(c==='"'){if(cell || closed)throw Error("Aspas inválidas no CSV.");quoted=true;}
  else if(c===';' || c==='\n' || c==='\r'){
   row.push(cell);cell="";closed=false;
   if(row.length>importLimits.columns)throw Error("Use três colunas separadas por ponto e vírgula.");
   if(c!==';'){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(v=>v.trim()))rows.push(row);row=[];if(rows.length>importLimits.rows+1)throw Error("Limite de 200 linhas de pessoas.");}
  }else{if(closed)throw Error("Texto após aspas no CSV.");cell+=c;}
 }
 if(quoted)throw Error("Aspas não fechadas no CSV.");
 if(cell || row.length){row.push(cell);if(row.some(v=>v.trim()))rows.push(row);}
 return rows;
}
export type ImportLine={line:number;values:string[];employee?:Employee;error?:string;duplicate:boolean;excluded:boolean;acknowledged:boolean};
const key=(s:string)=>s.trim().toLocaleLowerCase("pt-BR");
export function previewTeamImport(document:EscalaLivreDocument,rows:string[][],newId:()=>string):ImportLine[]{
 if(rows.length>201)throw Error("Limite de 200 linhas de pessoas.");
 if(JSON.stringify(rows[0]?.map(key))!==JSON.stringify(["nome","funcao","modelo"]))throw Error("Cabeçalho esperado: nome;funcao;modelo.");
 const seen=new Set(document.employees.map(e=>key(e.name)));
 return rows.slice(1).map((values,i)=>{
  const [name,roleName,model]=values.map(v=>v.trim());const duplicate=seen.has(key(name??""));seen.add(key(name??""));
  const line:ImportLine={line:i+2,values,duplicate,excluded:false,acknowledged:false};
  try{
   if(values.length!==3 || !name)throw Error("Preencha nome, funcao e modelo.");
   const roles=document.roles?.filter(r=>key(r.name)===key(roleName));if(roles?.length!==1)throw Error("Função não cadastrada ou ambígua.");
   if(!["5x2","6x1","empresa"].includes(key(model)))throw Error("Modelo: 5x2, 6x1 ou empresa.");
   let employee:Employee={id:newId(),name,role:roles[0].name,roleId:roles[0].id,inheritsCompanyDefaults:true,workload:structuredClone(document.company.defaultWorkload),availability:[],restrictions:[],preferences:[],preferredDaysOff:[],allowsOvertime:false,allowsNightWork:false,shiftStartsAt:document.company.opensAt};
   if(key(model)!=="empresa")employee=selectEmployeePattern(employee,document.company,key(model)==="5x2"?5:6);
   const result=documentSchema.safeParse({...document,employees:[...document.employees,employee]});if(!result.success)throw Error(result.error.issues[0].message);
   line.employee=employee;
  }catch(error){line.error=error instanceof Error?error.message:String(error);}
  return line;
 });
}
export function confirmTeamImport(current:EscalaLivreDocument,baseline:string,lines:ImportLine[]):EscalaLivreDocument{
 if(JSON.stringify(current)!==baseline)throw Error("O documento mudou. Leia o arquivo novamente.");
 const included=lines.filter(l=>!l.excluded);
 if(!included.length || included.some(l=>l.error || !l.employee || (l.duplicate&&!l.acknowledged)))throw Error("Corrija ou exclua erros e confirme possíveis duplicações.");
 const document={...current,employees:[...current.employees,...included.map(l=>l.employee!)]};const parsed=documentSchema.safeParse(document);
 if(!parsed.success)throw Error(parsed.error.issues[0].message);return document;
}
