import { regimeTypes, type RegimeType, type WorkloadRule } from "../types/schedule";

type RegimeConstraints = {
  maximumWorkMillis?: number;
  restMillis?: number;
  rollingCycle?: { workDays: number; restDays: number };
};
type RegimeDefinition = {
  label: string;
  shortLabel: string;
  workLabel: string;
  restLabel: string;
  describe: (rule: WorkloadRule) => string;
  constraints: (rule: WorkloadRule) => RegimeConstraints;
};

// Metadata and existing constraint families only; no runtime registration or plugins.
const definitions: Record<RegimeType, RegimeDefinition> = {
  dayBased: {
    label: "Ciclo em dias", shortLabel: "DAY_BASED",
    workLabel: "Máximo de dias de trabalho no ciclo", restLabel: "Dias de folga no ciclo",
    describe: r => `Ciclo ${r.workUnits}×${r.restUnits}: no máximo ${r.workUnits} dias trabalhados a cada ${r.workUnits + r.restUnits} dias. As folgas são distribuídas pelo gerador conforme a cobertura.`,
    constraints: r => ({ rollingCycle: { workDays: r.workUnits, restDays: r.restUnits } })
  },
  hourBased: {
    label: "Ciclo em horas", shortLabel: "HOUR_BASED",
    workLabel: "Máximo de horas por turno", restLabel: "Horas de descanso entre turnos",
    describe: r => `Cada turno pode ter até ${r.workUnits} horas, com pelo menos ${r.restUnits} horas de descanso. Também vale o descanso mínimo da empresa.`,
    constraints: r => ({ maximumWorkMillis: r.workUnits * 3600000, restMillis: r.restUnits * 3600000 })
  }
};

export function regimeDefinition(type: RegimeType): Readonly<RegimeDefinition> {
  if (!Object.prototype.hasOwnProperty.call(definitions, type)) throw new Error("Regime desconhecido.");
  return definitions[type];
}
export const regimeChoices = regimeTypes.map(type => ({ type, label: regimeDefinition(type).label }));
export const regimeConstraints = (rule: WorkloadRule): RegimeConstraints => regimeDefinition(rule.regimeType).constraints(rule);
