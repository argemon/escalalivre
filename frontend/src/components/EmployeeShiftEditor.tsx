import { useState } from "react";
import { useScheduleStore } from "../store/scheduleStore";
import { documentSchema } from "../lib/documentSchema";
import { secondsDuration } from "../lib/policies/weeklyWorkPlan";
import type { ShiftAssignment } from "../types/schedule";
import { Button } from "./ui";

export function EmployeeShiftEditor({ shift }: { shift: ShiftAssignment }) {
  const { document, analysis, upsertAssignment } = useScheduleStore();
  const [end, setEnd] = useState(shift.end);
  const [error, setError] = useState("");
  const day = analysis.workloads?.filter(w => w.employeeId === shift.employeeId)
    .flatMap(w => w.days).find(d => d.date.slice(0, 10) === shift.start.slice(0, 10));
  function save() {
    const updated = { ...shift, end: end.length === 16 ? end + ":00" : end };
    const result = documentSchema.safeParse({ ...document, assignments: document.assignments.map(a => a.id === shift.id ? updated : a) });
    if (!result.success) { setError("Confira a saída: deve ser posterior à entrada e manter o intervalo dentro do turno."); return; }
    upsertAssignment(updated);
    setError("");
  }
  return <div className="space-y-2 rounded border border-border p-3">
    <p>Entrada: {shift.start.replace("T", " às ")}</p>
    <label className="block">Saída neste dia<input type="datetime-local" step="1" required value={end} onChange={e => setEnd(e.target.value)} /></label>
    <Button type="button" onClick={save}>Salvar saída manual</Button>
    {day && <p role="status">Previsto: {secondsDuration(day.expectedSeconds)} · Planejado: {secondsDuration(day.plannedSeconds)} · {day.unmetSeconds > 0 ? `Faltam ${secondsDuration(day.unmetSeconds)} para cumprir a jornada deste dia` : "Jornada do dia cumprida"}</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
