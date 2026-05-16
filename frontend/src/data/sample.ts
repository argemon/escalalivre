import type { EscalaLivreDocument, ScheduleResult } from "../types/schedule";

export const sampleDocument: EscalaLivreDocument = {
  schemaVersion: "1.0.0",
  id: "4e8a2937-f61a-46bf-a33f-9ce0f7b13279",
  company: {
    name: "EscalaLivre Demo",
    opensAt: "08:00:00",
    closesAt: "22:00:00",
    operatingDays: [1, 2, 3, 4, 5, 6],
    defaultWorkload: {
      regimeType: "dayBased",
      workUnits: 5,
      restUnits: 2,
      weeklyLimitHours: 44,
      defaultShiftDuration: "08:00:00"
    },
    lunch: {
      minimum: "01:00:00",
      maximum: "02:00:00",
      preferredAfter: "04:00:00"
    },
    minimumRest: "11:00:00",
    coverage: [
      { role: "vendedor", day: 1, start: "09:00:00", end: "18:00:00", minimumEmployees: 2 },
      { role: "vendedor", day: 6, start: "18:00:00", end: "22:00:00", minimumEmployees: 2 },
      { role: "caixa", day: 1, start: "10:00:00", end: "20:00:00", minimumEmployees: 1 }
    ]
  },
  employees: [
    {
      id: "6dc2656b-ad7f-48ca-8204-a6dce313f00c",
      name: "Ana Costa",
      role: "vendedor",
      inheritsCompanyDefaults: true,
      workload: { regimeType: "dayBased", workUnits: 5, restUnits: 2, weeklyLimitHours: 44, defaultShiftDuration: "08:00:00" },
      availability: [],
      restrictions: [],
      preferences: [{ code: "morning", weight: 4, description: "Prefere abrir loja" }],
      allowsOvertime: false,
      allowsNightWork: false,
      preferredDaysOff: [0]
    },
    {
      id: "4d4d59dd-9891-428a-95e3-c48508320516",
      name: "Bruno Lima",
      role: "vendedor",
      inheritsCompanyDefaults: false,
      workload: { regimeType: "hourBased", workUnits: 12, restUnits: 36, weeklyLimitHours: 44, defaultShiftDuration: "12:00:00" },
      availability: [],
      restrictions: [],
      preferences: [{ code: "night", weight: 3, description: "Aceita fechamento" }],
      allowsOvertime: true,
      allowsNightWork: true,
      preferredDaysOff: [2]
    },
    {
      id: "729ef3cd-bd12-4eb6-9e82-5f7e28c538f6",
      name: "Carla Souza",
      role: "caixa",
      inheritsCompanyDefaults: true,
      workload: { regimeType: "dayBased", workUnits: 6, restUnits: 1, weeklyLimitHours: 44, defaultShiftDuration: "07:20:00" },
      availability: [],
      restrictions: [],
      preferences: [],
      allowsOvertime: false,
      allowsNightWork: false,
      preferredDaysOff: [0]
    }
  ],
  assignments: [
    {
      id: "b95a1083-e871-4d96-9ba3-8475ec8763a5",
      employeeId: "6dc2656b-ad7f-48ca-8204-a6dce313f00c",
      role: "vendedor",
      start: "2026-05-18T09:00:00",
      end: "2026-05-18T17:00:00",
      break: { start: "2026-05-18T13:00:00", end: "2026-05-18T14:00:00" },
      source: "manual",
      tags: ["preferencia"]
    }
  ],
  updatedAt: "2026-05-16T17:00:00.000Z"
};

export const sampleAnalysis: ScheduleResult = {
  assignments: sampleDocument.assignments,
  conflicts: [],
  gaps: [
    { start: "2026-05-23T18:00:00", end: "2026-05-23T22:00:00", role: "vendedor", missingEmployees: 1 }
  ],
  hiringSuggestions: [
    {
      role: "vendedor",
      weeklyHours: 20,
      idealWindows: [{ start: "2026-05-19T18:00:00", end: "2026-05-23T22:00:00" }],
      rationale: "Demanda de fechamento concentrada entre terca e sabado."
    }
  ],
  coverageScore: 0.82
};
