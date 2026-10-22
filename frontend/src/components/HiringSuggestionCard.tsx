import type { HiringSuggestion } from "../types/schedule";

const hours=(value:number)=>value.toLocaleString("pt-BR",{maximumFractionDigits:2});
export function HiringSuggestionCard({suggestion}:{suggestion:HiringSuggestion}){
  return <article className="rounded-md border border-border bg-background p-3">
    <p className="text-sm font-semibold">{suggestion.role} · estimativa mínima de {suggestion.minimumPeople} {suggestion.minimumPeople===1?"pessoa":"pessoas"}</p>
    <p className="mt-2 text-sm">{hours(suggestion.totalHours)} h-pessoa faltantes no período</p>
    <p className="text-xs text-muted-foreground">Semana mais carregada: {hours(suggestion.weeklyHours)} h-pessoa · até {suggestion.peakMissingEmployees} em falta ao mesmo tempo</p>
    <p className="mt-2 text-xs text-muted-foreground">Referência: {hours(suggestion.referenceWeeklyHours)} h semanais por pessoa. {suggestion.rationale}</p>
    <details className="mt-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer">Demanda por semana</summary>
      {suggestion.weeklyDemand.map(week=><p key={week.weekStart} className="mt-1">Semana de {week.weekStart.split("-").reverse().join("/")}: {hours(week.hours)} h-pessoa</p>)}
      <p className="mt-2">Semanas de domingo a sábado. Semanas parciais consideram apenas a demanda calculada, sem extrapolação.</p>
    </details>
  </article>;
}
