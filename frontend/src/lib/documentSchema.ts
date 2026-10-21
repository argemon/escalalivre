import { migrateDocument } from "./documentLifecycle";
import { validCivilDateTime, validTimeZone } from "./dateTime";
import { z } from "zod";
import type { EscalaLivreDocument } from "../types/schedule";
import { migratePlanningPeriod, periodError } from "./planningPeriod";

const time = z.string().regex(/^\d{2}:\d{2}:\d{2}$/).refine(v => {
  const [h, m, s] = v.split(":").map(Number);
  return h < 24 && m < 60 && s < 60;
}, "Horario invalido");
const date = z.string().refine(validCivilDateTime, "Data e horário civis inválidos");
const instant = z.string().datetime({offset:true});
const days = z.array(z.number().int().min(0).max(6));
const windowSchema = z.object({ start: date, end: date }).refine(v => Date.parse(v.end) > Date.parse(v.start), "Fim deve ser posterior ao inicio");
const workload = z.object({
  regimeType: z.enum(["dayBased", "hourBased"]), workUnits: z.number().int().positive().max(168),
  restUnits: z.number().int().min(0).max(168), weeklyLimitHours: z.number().positive().max(44),
  defaultShiftDuration: time
});
const canonicalDocumentSchema = z.object({
  planningPeriod: z.object({ start: z.string(), end: z.string() }).refine(p => !periodError(p), "Período inválido: use de 1 a 31 dias entre 1900 e 2100.").optional(),
  roles: z.array(z.object({ id: z.string().uuid(), name: z.string().trim().min(1) })).optional(),
  setup: z.object({ companyConfigured: z.boolean() }).optional(),
  schemaVersion: z.literal("1.0.0"), id: z.string().uuid(), updatedAt: instant,
  company: z.object({
    timeZone: z.string().refine(validTimeZone, "Fuso horário inválido"),
    holidays: z.array(z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),name:z.string().trim().min(1),closed:z.boolean()})).optional(),
    middayClosure: z.object({ start: time, end: time }).optional(),
    name: z.string().min(1), opensAt: time, closesAt: time, operatingDays: days,
    defaultWorkload: workload, minimumRest: time,
    lunch: z.object({ minimum: time, maximum: time, preferredAfter: time }),
    coverage: z.array(z.object({ scope:z.enum(["role","team"]).optional(), daysMode: z.enum(["operating", "custom"]).optional(), allowsOutsideHours: z.boolean().optional(), roleId: z.string().uuid().optional(), role: z.string().min(1), day: z.number().int().min(0).max(6), start: time, end: time, minimumEmployees: z.number().int().min(0).max(200) })).max(1000)
  }),
  employees: z.array(z.object({
    id: z.string().uuid(), name: z.string().min(1), roleId: z.string().uuid().optional(), role: z.string().min(1), inheritsCompanyDefaults: z.boolean(),
    coverageRoleIds:z.array(z.string().uuid()).optional(), coverageRoles:z.array(z.string()).optional(), fixedInterval: z.object({start:time,end:time}).optional(), shiftStartsAt: time.optional(), worksDuringLunchClosure: z.boolean().optional(), workload, availability: z.array(windowSchema), restrictions: z.array(windowSchema),
    preferences: z.array(z.object({ code: z.string(), weight: z.number().int(), description: z.string() })),
    allowsOvertime: z.boolean(), allowsNightWork: z.boolean(), preferredDaysOff: days, workingDays: days.min(1, "Selecione ao menos um dia de trabalho.").optional()
  })).max(200),
  assignments: z.array(z.object({
    id: z.string().uuid(), employeeId: z.string().uuid(), roleId: z.string().uuid().optional(), role: z.string().min(1), start: date, end: date,
    break: windowSchema.nullish().transform(v => v ?? undefined), source: z.enum(["manual", "solver"]), tags: z.array(z.string())
  }).refine(v => Date.parse(v.end) > Date.parse(v.start), "Turno invalido")).max(20000)
}).superRefine((doc, ctx) => {
  const ids = new Set(doc.employees.map(e => e.id));
  if (ids.size !== doc.employees.length || new Set(doc.assignments.map(a => a.id)).size !== doc.assignments.length)
    ctx.addIssue({ code: "custom", message: "Identificadores duplicados" });
  for (const a of doc.assignments) {
    if (!ids.has(a.employeeId)) ctx.addIssue({ code: "custom", message: "Funcionario do turno inexistente" });
    if (a.break && (Date.parse(a.break.start) < Date.parse(a.start) || Date.parse(a.break.end) > Date.parse(a.end)))
      ctx.addIssue({ code: "custom", message: "Intervalo fora do turno" });
  }
}).transform(migratePlanningPeriod);

export const documentSchema = z.preprocess(input => {
  try { return migrateDocument(input as EscalaLivreDocument).document; } catch { return input; }
}, canonicalDocumentSchema);
