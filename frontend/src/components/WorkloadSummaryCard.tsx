import type { WorkloadSummary } from "../types/schedule";
import { secondsDuration } from "../lib/policies/weeklyWorkPlan";

export function WorkloadSummaryCard({ summary: w, name }: { summary: WorkloadSummary; name?: string }) {
  return <section className="space-y-2 rounded border border-border p-3">
    <h3>{name} · semana {w.weekStart.slice(0, 10).split("-").reverse().join("/")}</h3>
    <p>Mínimo contratado na semana completa: {secondsDuration(w.contractedSeconds)}</p>
    <p>Previsto neste período: {secondsDuration(w.expectedSeconds)} · Planejado: {secondsDuration(w.plannedSeconds)} · Cumprido como jornada normal: {secondsDuration(w.recognizedSeconds)}</p>
    <p role="status" className={w.unmetSeconds > 0 ? "font-semibold text-amber-700 dark:text-amber-300" : "text-emerald-600"}>{w.unmetSeconds > 0 ? `Faltam ${secondsDuration(w.unmetSeconds)} para cumprir a jornada prevista` : "Jornada prevista cumprida"}</p>
    <p>Dispensado: {secondsDuration(w.excusedSeconds)} · Trabalho além do reconhecido: {secondsDuration(w.excessSeconds)}</p>
    {w.unassignedSeconds!==undefined && <p>Carga ainda sem dia definido: {secondsDuration(w.unassignedSeconds)}. Dias sem turno não são marcados como falta diária enquanto as folgas estão sendo escolhidas.</p>}
    <details><summary>Ver horas por dia</summary><ul className="space-y-2">{w.days.map(d => <li key={d.date}>
      {d.date.slice(0, 10).split("-").reverse().join("/")}: previsto {secondsDuration(d.expectedSeconds)}, planejado {secondsDuration(d.plannedSeconds)}, faltam {secondsDuration(d.unmetSeconds)}
    </li>)}</ul></details>
    <p className="text-xs text-muted-foreground">Saldo da escala planejada, sem apuração de ponto ou desconto salarial. Saída antecipada sem dispensa mantém a falta no dia; extras em outro dia não a quitam automaticamente.</p>
  </section>;
}
