import { useState } from "react";
import { periodError } from "../lib/planningPeriod";
import { useScheduleStore } from "../store/scheduleStore";
import { Button } from "./ui";

export function PlanningPeriodEditor() {
  const period = useScheduleStore(state => state.document.planningPeriod);
  const setPeriod = useScheduleStore(state => state.setPlanningPeriod);
  const [draft, setDraft] = useState(period);
  const error = periodError(draft);
  return <form className="planning-period" aria-label="Período de planejamento" onSubmit={e => {e.preventDefault(); if (!error) setPeriod(draft);}}>
    <span className="self-center text-sm font-medium">Período</span>
    {(["start", "end"] as const).map(field => <label key={field} className="text-xs">{field === "start" ? "Início" : "Fim (inclusive)"}<input type="date" required min="1900-01-01" max="2100-12-31" value={draft[field]} onChange={e => setDraft({...draft,[field]:e.target.value})} className="ml-2 rounded border border-border bg-background p-1 text-sm" /></label>)}
    <Button type="submit" className="h-8 text-xs" disabled={!!error || (draft.start === period.start && draft.end === period.end)}>Aplicar período</Button>
    <span className="period-hint text-xs text-muted-foreground" title="Calendário, cobertura e geração usam estas datas.">Até 31 dias</span>
    {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
  </form>;
}
