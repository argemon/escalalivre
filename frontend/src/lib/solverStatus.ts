import type { ScheduleResult } from "../types/schedule";

export type SolverStatus="idle"|"calculating"|"feasible"|"optimal"|"invalid";
export const solverLabels:Record<SolverStatus,string>={idle:"Pronto",calculating:"Calculando",feasible:"Solução viável",optimal:"Ótimo comprovado",invalid:"Revisar escala"};
export const solverDescriptions:Partial<Record<SolverStatus,string>>={
  feasible:"Solução encontrada, sem comprovação de que seja a melhor. Confira a cobertura e os pontos de atenção.",
  optimal:"O solver comprovou o melhor resultado para o modelo e as opções de turno avaliadas. Ainda pode haver faltas de cobertura."
};
export function generationStatus(result:ScheduleResult):SolverStatus {
  if(result.conflicts.some(c=>c.severity==="error") || ["infeasible","timeout","invalid"].includes(result.optimization?.status??""))return "invalid";
  // Older responses carry no proof; coverage alone cannot establish optimality.
  return result.optimization?.status==="optimal"?"optimal":"feasible";
}
