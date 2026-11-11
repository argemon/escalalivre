import { z } from "zod";
import { periodError } from "./planningPeriod";
import { validCivilDateTime,validTimeZone } from "./dateTime";
export const publicationLimits={count:10,bytes:262144,totalBytes:524288,people:200,shifts:1000};
const id=z.guid().refine(v=>v!=="00000000-0000-0000-0000-000000000000"),text=z.string().min(1).max(256).refine(v=>v.trim().length>0),civil=z.string().length(19).refine(validCivilDateTime);
const period=z.object({start:z.string(),end:z.string()}).refine(p=>!periodError(p));
export const publicationSchema=z.object({id,number:z.number().int().min(1).max(10),period,closedAt:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/).datetime().refine(v=>Number(v.slice(0,4))>=1),companyName:text,companyTimeZone:z.string().max(128).refine(validTimeZone),
 people:z.array(z.object({id,name:text,role:text})).max(publicationLimits.people),
 shifts:z.array(z.object({id,employeeId:id,role:text,start:civil,end:civil,break:z.object({start:civil,end:civil}).optional()})).max(publicationLimits.shifts),
 acknowledgements:z.array(z.object({category:z.enum(["staffing","workload","warning","preference"]),groups:z.number().int().min(1).max(100000),occurrences:z.number().int().min(1).max(100000)})).max(4)
}).superRefine((v,ctx)=>{const fail=()=>ctx.addIssue({code:"custom",message:"Versão fechada inválida ou acima da cota; arquive/exporte o documento."});const people=new Set(v.people.map(p=>p.id));if(people.size!==v.people.length||new Set(v.shifts.map(s=>s.id)).size!==v.shifts.length||new Set(v.acknowledgements.map(a=>a.category)).size!==v.acknowledgements.length)fail();for(const s of v.shifts)if(!people.has(s.employeeId)||s.end<=s.start||Date.parse(s.end+"Z")-Date.parse(s.start+"Z")>172800000||s.start.slice(0,10)<v.period.start||s.start.slice(0,10)>v.period.end||(s.break&&(s.break.start<s.start||s.break.end>s.end||s.break.end<=s.break.start)))fail();if(new TextEncoder().encode(JSON.stringify(v)).length>publicationLimits.bytes)fail();});
export const publicationSelectionSchema=z.object({start:z.string(),end:z.string(),versionId:id});
export type Publication=z.infer<typeof publicationSchema>;
export type PublicationSelection=z.infer<typeof publicationSelectionSchema>;
export function archiveError(v:{publications?:Publication[];publicationSelections?:PublicationSelection[]}){const all=v.publications??[],selected=v.publicationSelections??[];if(new Set(all.map(p=>p.id)).size!==all.length||all.some((p,i)=>p.number!==i+1)||new TextEncoder().encode(JSON.stringify(all)).length>publicationLimits.totalBytes)return "Arquivo de versões inválido ou acima de 512 KiB; arquive/exporte antes de continuar.";if(new Set(selected.map(p=>p.start+"/"+p.end)).size!==selected.length||selected.some(s=>!all.some(p=>p.id===s.versionId&&p.period.start===s.start&&p.period.end===s.end)))return "Seleção de versão vigente inválida.";}
