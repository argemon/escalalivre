import { z } from "zod";

const time = z.string().regex(/^\d{2}:\d{2}:\d{2}$/).refine(v => {
  const [h, m, s] = v.split(":").map(Number);
  return h < 24 && m < 60 && s < 60;
}, "Horario invalido");
const date = z.string().refine(v => Number.isFinite(Date.parse(v)), "Data invalida");
const days = z.array(z.number().int().min(0).max(6));
const windowSchema = z.object({ start: date, end: date }).refine(v => Date.parse(v.end) > Date.parse(v.start), "Fim deve ser posterior ao inicio");
const workload = z.object({
  regimeType: z.enum(["dayBased", "hourBased"]), workUnits: z.number().int().positive().max(168),
  restUnits: z.number().int().min(0).max(168), weeklyLimitHours: z.number().positive().max(44),
  defaultShiftDuration: time
});
export const documentSchema = z.object({
  schemaVersion: z.literal("1.0.0"), id: z.string().uuid(), updatedAt: date,
  company: z.object({
    name: z.string().min(1), opensAt: time, closesAt: time, operatingDays: days,
    defaultWorkload: workload, minimumRest: time,
    lunch: z.object({ minimum: time, maximum: time, preferredAfter: time }),
    coverage: z.array(z.object({ role: z.string().min(1), day: z.number().int().min(0).max(6), start: time, end: time, minimumEmployees: z.number().int().min(0).max(200) })).max(1000)
  }),
  employees: z.array(z.object({
    id: z.string().uuid(), name: z.string().min(1), role: z.string().min(1), inheritsCompanyDefaults: z.boolean(),
    workload, availability: z.array(windowSchema), restrictions: z.array(windowSchema),
    preferences: z.array(z.object({ code: z.string(), weight: z.number().int(), description: z.string() })),
    allowsOvertime: z.boolean(), allowsNightWork: z.boolean(), preferredDaysOff: days
  })).max(200),
  assignments: z.array(z.object({
    id: z.string().uuid(), employeeId: z.string().uuid(), role: z.string().min(1), start: date, end: date,
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
});
