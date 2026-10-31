import { normalizeCoverageRoles } from "./roles";
import limits from "../../../shared/document-validation-limits.json";
import { civilMillis, clockMillis } from "./civilTime";
import { migrateDocument } from "./documentLifecycle";
import { validCivilDateTime, validTimeZone } from "./dateTime";
import { z } from "zod";
import type { EscalaLivreDocument } from "../types/schedule";
import { regimeTypes } from "../types/schedule";
import { migratePlanningPeriod, periodError } from "./planningPeriod";
import { documentStructureIssue } from "./documentStructure";

// Stop at the first failing element. Even an in-bounds collection can otherwise
// accumulate many nested errors; callers only display the first diagnostic.
function boundedArray<T extends z.ZodType>(schema:T,maximum:number) {
  return z.unknown().transform((input,ctx):z.output<T>[]=>{
    if(!Array.isArray(input) || input.length>maximum) {
      ctx.addIssue({code:"custom",message:"Coleção inválida ou acima do limite."});return z.NEVER;
    }
    const values:z.output<T>[]=[];
    for(let i=0;i<input.length;i++) {
      const parsed=schema.safeParse(input[i]);
      if(!parsed.success) {
        const issue=parsed.error.issues[0];
        ctx.addIssue({code:"custom",message:issue.message,path:[i,...issue.path]});return z.NEVER;
      }
      values.push(parsed.data);
    }
    return values;
  });
}

// Existing .NET/TS limits count UTF-16 code units; Zod 4.6 counts code points.
const boundedString=(maximum:number)=>z.string().refine(v=>v.length<=maximum,{error:"Texto acima do limite.",abort:true});
const text = boundedString(limits.text).refine(v => v.trim().length > 0, "Texto obrigatório");
const description = boundedString(limits.text);
// Preserve Zod 3/.NET Guid's hex format; Zod 4's uuid() narrows variant/version bits.
const id = z.guid().refine(v => v !== "00000000-0000-0000-0000-000000000000", "Identificador vazio");
const time = z.string().regex(/^\d{2}:\d{2}:\d{2}$/).refine(v => {
  const [h,m,s] = v.split(":").map(Number);return h < 24 && m < 60 && s < 60;
}, "Horário inválido");
// Accept legacy TimeSpan day notation; expose total hours to the existing civil arithmetic.
const duration = z.string().regex(/^(?:\d+\.)?\d{2,3}:\d{2}:\d{2}$/).refine(v => {
  const [clock] = v.split(".").slice(-1),[h,m,s] = clock.split(":").map(Number);
  return (!v.includes(".") || h < 24) && m < 60 && s < 60;
}, "Duração inválida").transform(v => {
  const parts=v.split("."),[h,m,s]=parts[parts.length-1].split(":").map(Number);
  return String(h+(parts.length===2?Number(parts[0])*24:0)).padStart(2,"0")+":"+String(m).padStart(2,"0")+":"+String(s).padStart(2,"0");
});
const boundedDuration = (min:number,max:number) => duration.refine(v => {
  const seconds=clockMillis(v)/1000;return seconds>=min && seconds<=max;
}, "Duração fora dos limites");
const date = z.string().refine(validCivilDateTime, "Data e horário civis inválidos");
const instant = z.string().datetime({offset:true});
const days = boundedArray(z.number().int().min(0).max(6),limits.days).refine(v => new Set(v).size===v.length, "Dias duplicados");
// Invalid date fields must remain schema errors rather than throw from civil arithmetic.
const civilTimestamp = (value:string) => validCivilDateTime(value) ? civilMillis(value) : NaN;
const windowSchema = z.object({start:date,end:date}).refine(v => civilTimestamp(v.end)>civilTimestamp(v.start), "Fim deve ser posterior ao inicio");
const workload = z.object({
  regimeType:z.enum(regimeTypes),workUnits:z.number().int().min(1).max(limits.workUnits),
  restUnits:z.number().int().min(0).max(limits.workUnits),weeklyLimitHours:z.number().positive().max(limits.weeklyHours),
  defaultShiftDuration:boundedDuration(1,limits.shiftDurationSeconds)
});
const canonicalDocumentSchema = z.object({
  planningPeriod:z.object({start:z.string(),end:z.string()}).refine(p => !periodError(p), "Período inválido: use de 1 a 31 dias entre 1900 e 2100.").optional(),
  roles:boundedArray(z.object({id,name:text}),limits.roles).refine(v => new Set(v.map(r=>r.id)).size===v.length,"Cargos duplicados").optional(),
  setup:z.object({companyConfigured:z.boolean()}).optional(),
  schemaVersion:z.literal("1.0.0"),id,updatedAt:instant,
  company:z.object({
    timeZone:boundedString(limits.timeZone).refine(validTimeZone,"Fuso horário inválido"),
    holidays:boundedArray(z.object({date:z.string().refine(v=>validCivilDateTime(v+"T00:00:00"),"Data inválida"),name:text,closed:z.boolean()}),limits.holidays).optional(),
    middayClosure:z.object({start:time,end:time}).optional(),
    name:text,opensAt:time,closesAt:time,operatingDays:days,defaultWorkload:workload,
    minimumRest:boundedDuration(limits.minimumRestSeconds,limits.maximumRestSeconds),
    lunch:z.object({minimum:boundedDuration(0,limits.lunchSeconds),maximum:boundedDuration(0,limits.lunchSeconds),preferredAfter:boundedDuration(0,limits.preferredAfterSeconds)})
      .refine(v=>clockMillis(v.maximum)>=clockMillis(v.minimum),"Intervalo máximo deve ser maior ou igual ao mínimo"),
    coverage:boundedArray(z.object({scope:z.enum(["role","team"]).optional(),daysMode:z.enum(["operating","custom"]).nullish().transform(v=>v??undefined),allowsOutsideHours:z.boolean().optional(),roleId:id.optional(),role:text,day:z.number().int().min(0).max(6),start:time,end:time,minimumEmployees:z.number().int().min(0).max(limits.employees)}),limits.coverage)
  }),
  employees:boundedArray(z.object({
    id,name:text,roleId:id.optional(),role:text,inheritsCompanyDefaults:z.boolean(),
    coverageRoleIds:boundedArray(id,limits.coverageRoles).optional(),coverageRoles:boundedArray(text,limits.coverageRoles).optional(),fixedInterval:z.object({start:time,end:time}).optional(),shiftStartsAt:time.optional(),worksDuringLunchClosure:z.boolean().optional(),
    workload,availability:boundedArray(windowSchema,limits.windows),restrictions:boundedArray(windowSchema,limits.windows),
    preferences:boundedArray(z.object({code:text,weight:z.number().int().min(-limits.preferenceWeight).max(limits.preferenceWeight),description}),limits.preferences),
    allowsOvertime:z.boolean(),allowsNightWork:z.boolean(),preferredDaysOff:days,workingDays:days.refine(v=>v.length>0,"Selecione ao menos um dia de trabalho.").optional()
  }),limits.employees),
  assignments:boundedArray(z.object({
    id,employeeId:id,roleId:id.optional(),role:text,start:date,end:date,
    break:windowSchema.nullish().transform(v=>v??undefined),source:z.enum(["manual","solver"]),tags:boundedArray(text,limits.tags)
  }).refine(v=>civilTimestamp(v.end)>civilTimestamp(v.start) && civilTimestamp(v.end)-civilTimestamp(v.start)<=limits.assignmentSeconds*1000,"Turno inválido ou acima do limite de duração"),limits.assignments)
}).superRefine((doc,ctx)=>{
  const ids=new Set(doc.employees.map(e=>e.id));
  if(ids.size!==doc.employees.length || new Set(doc.assignments.map(a=>a.id)).size!==doc.assignments.length){ctx.addIssue({code:"custom",message:"Identificadores duplicados"});return;}
  for(const a of doc.assignments){
    if(!ids.has(a.employeeId)){ctx.addIssue({code:"custom",message:"Funcionario do turno inexistente"});return;}
    if(a.break && (civilTimestamp(a.break.start)<civilTimestamp(a.start) || civilTimestamp(a.break.end)>civilTimestamp(a.end))){ctx.addIssue({code:"custom",message:"Intervalo fora do turno"});return;}
  }
}).transform(migratePlanningPeriod);

const structureSchema=z.unknown().transform((input,ctx)=>{
  const issue=documentStructureIssue(input);
  if(issue){ctx.addIssue({code:"custom",...issue});return z.NEVER;}
  return input;
});
export const documentSchema=structureSchema.pipe(z.preprocess(input=>{
  try{return migrateDocument(input as EscalaLivreDocument).document;}catch{return input;}
},canonicalDocumentSchema.transform(normalizeCoverageRoles)));
