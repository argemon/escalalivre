import limits from "../../../shared/document-validation-limits.json";
import { civilMillis, clockMillis } from "./civilTime";
import { migrateDocument } from "./documentLifecycle";
import { validCivilDateTime, validTimeZone } from "./dateTime";
import { z } from "zod";
import type { EscalaLivreDocument } from "../types/schedule";
import { migratePlanningPeriod, periodError } from "./planningPeriod";

const text = z.string().max(limits.text).refine(v => v.trim().length > 0, "Texto obrigatório");
const description = z.string().max(limits.text);
const id = z.string().uuid().refine(v => v !== "00000000-0000-0000-0000-000000000000", "Identificador vazio");
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
const days = z.array(z.number().int().min(0).max(6)).max(limits.days).refine(v => new Set(v).size===v.length, "Dias duplicados");
// Invalid date fields must remain schema errors rather than throw from civil arithmetic.
const civilTimestamp = (value:string) => validCivilDateTime(value) ? civilMillis(value) : NaN;
const windowSchema = z.object({start:date,end:date}).refine(v => civilTimestamp(v.end)>civilTimestamp(v.start), "Fim deve ser posterior ao inicio");
const workload = z.object({
  regimeType:z.enum(["dayBased","hourBased"]),workUnits:z.number().int().min(1).max(limits.workUnits),
  restUnits:z.number().int().min(0).max(limits.workUnits),weeklyLimitHours:z.number().positive().max(limits.weeklyHours),
  defaultShiftDuration:boundedDuration(1,limits.shiftDurationSeconds)
});
const canonicalDocumentSchema = z.object({
  planningPeriod:z.object({start:z.string(),end:z.string()}).refine(p => !periodError(p), "Período inválido: use de 1 a 31 dias entre 1900 e 2100.").optional(),
  roles:z.array(z.object({id,name:text})).max(limits.roles).refine(v => new Set(v.map(r=>r.id)).size===v.length,"Cargos duplicados").optional(),
  setup:z.object({companyConfigured:z.boolean()}).optional(),
  schemaVersion:z.literal("1.0.0"),id,updatedAt:instant,
  company:z.object({
    timeZone:z.string().max(limits.timeZone).refine(validTimeZone,"Fuso horário inválido"),
    holidays:z.array(z.object({date:z.string().refine(v=>validCivilDateTime(v+"T00:00:00"),"Data inválida"),name:text,closed:z.boolean()})).max(limits.holidays).optional(),
    middayClosure:z.object({start:time,end:time}).optional(),
    name:text,opensAt:time,closesAt:time,operatingDays:days,defaultWorkload:workload,
    minimumRest:boundedDuration(limits.minimumRestSeconds,limits.maximumRestSeconds),
    lunch:z.object({minimum:boundedDuration(0,limits.lunchSeconds),maximum:boundedDuration(0,limits.lunchSeconds),preferredAfter:boundedDuration(0,limits.preferredAfterSeconds)})
      .refine(v=>clockMillis(v.maximum)>=clockMillis(v.minimum),"Intervalo máximo deve ser maior ou igual ao mínimo"),
    coverage:z.array(z.object({scope:z.enum(["role","team"]).optional(),daysMode:z.enum(["operating","custom"]).nullish().transform(v=>v??undefined),allowsOutsideHours:z.boolean().optional(),roleId:id.optional(),role:text,day:z.number().int().min(0).max(6),start:time,end:time,minimumEmployees:z.number().int().min(0).max(limits.employees)})).max(limits.coverage)
  }),
  employees:z.array(z.object({
    id,name:text,roleId:id.optional(),role:text,inheritsCompanyDefaults:z.boolean(),
    coverageRoleIds:z.array(id).max(limits.coverageRoles).optional(),coverageRoles:z.array(text).max(limits.coverageRoles).optional(),fixedInterval:z.object({start:time,end:time}).optional(),shiftStartsAt:time.optional(),worksDuringLunchClosure:z.boolean().optional(),
    workload,availability:z.array(windowSchema).max(limits.windows),restrictions:z.array(windowSchema).max(limits.windows),
    preferences:z.array(z.object({code:text,weight:z.number().int().min(-limits.preferenceWeight).max(limits.preferenceWeight),description})).max(limits.preferences),
    allowsOvertime:z.boolean(),allowsNightWork:z.boolean(),preferredDaysOff:days,workingDays:days.refine(v=>v.length>0,"Selecione ao menos um dia de trabalho.").optional()
  })).max(limits.employees),
  assignments:z.array(z.object({
    id,employeeId:id,roleId:id.optional(),role:text,start:date,end:date,
    break:windowSchema.nullish().transform(v=>v??undefined),source:z.enum(["manual","solver"]),tags:z.array(text).max(limits.tags)
  }).refine(v=>civilTimestamp(v.end)>civilTimestamp(v.start) && civilTimestamp(v.end)-civilTimestamp(v.start)<=limits.assignmentSeconds*1000,"Turno inválido ou acima do limite de duração")).max(limits.assignments)
}).superRefine((doc,ctx)=>{
  const ids=new Set(doc.employees.map(e=>e.id));
  if(ids.size!==doc.employees.length || new Set(doc.assignments.map(a=>a.id)).size!==doc.assignments.length)ctx.addIssue({code:"custom",message:"Identificadores duplicados"});
  for(const a of doc.assignments){
    if(!ids.has(a.employeeId))ctx.addIssue({code:"custom",message:"Funcionario do turno inexistente"});
    if(a.break && (civilTimestamp(a.break.start)<civilTimestamp(a.start) || civilTimestamp(a.break.end)>civilTimestamp(a.end)))ctx.addIssue({code:"custom",message:"Intervalo fora do turno"});
  }
}).transform(migratePlanningPeriod);

export const documentSchema=z.preprocess(input=>{
  try{return migrateDocument(input as EscalaLivreDocument).document;}catch{return input;}
},canonicalDocumentSchema);
