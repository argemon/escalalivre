import { useState, type FormEvent, type ReactNode } from "react";
import { useScheduleStore } from "../store/scheduleStore";
import { documentSchema } from "../lib/documentSchema";
import { dayLabels } from "../lib/planning";
import type { Employee, AvailabilityWindow } from "../types/schedule";
import { Button } from "./ui";

export function EmployeeDrawer() {
  const { document, selectedEmployeeId } = useScheduleStore();
  if (!selectedEmployeeId) return null;
  const employee = document.employees.find(e => e.id === selectedEmployeeId);
  if (!employee && selectedEmployeeId !== "new") return null;
  const initial: Employee = employee ?? { id: crypto.randomUUID(), name: "", role: "", inheritsCompanyDefaults: true,
    workload: { ...document.company.defaultWorkload }, availability: [], restrictions: [], preferences: [], allowsOvertime: false, allowsNightWork: false, preferredDaysOff: [] };
  return <EmployeeForm key={selectedEmployeeId} initial={initial} isNew={!employee} />;
}

function EmployeeForm({ initial, isNew }: { initial: Employee; isNew: boolean }) {
  const { document, upsertEmployee, deleteEmployee, setSelectedEmployeeId } = useScheduleStore();
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");
  const patch = (change: Partial<Employee>) => setDraft(d => ({ ...d, ...change }));
  const workload = (change: Partial<Employee["workload"]>) => patch({ workload: { ...draft.workload, ...change } });
  function save(event: FormEvent) {
    event.preventDefault();
    const employee = { ...draft, name: draft.name.trim(), role: draft.role.trim(), workload: draft.inheritsCompanyDefaults ? { ...document.company.defaultWorkload } : draft.workload };
    const result = documentSchema.safeParse({ ...document, employees: [...document.employees.filter(e => e.id !== employee.id), employee] });
    if (!result.success) { setError(result.error.issues[0].message); return; }
    upsertEmployee(employee);
  }
  return <div className="absolute inset-0 z-30 flex justify-end bg-black/40" onClick={() => setSelectedEmployeeId(undefined)}>
    <aside role="dialog" aria-modal="true" aria-label={isNew ? "Adicionar funcionário" : "Editar funcionário"} className="h-full w-full max-w-md border-l border-border bg-card shadow-2xl" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === "Escape") setSelectedEmployeeId(undefined); }}>
      <form onSubmit={save} className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b border-border p-5"><h2 className="text-xl font-semibold">{isNew ? "Adicionar funcionário" : "Editar funcionário"}</h2><Button type="button" onClick={() => setSelectedEmployeeId(undefined)}>Fechar</Button></header>
        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-5">
          <Field label="Nome"><input autoFocus required value={draft.name} onChange={e => patch({ name: e.target.value })} /></Field>
          <Field label="Função"><input required value={draft.role} onChange={e => patch({ role: e.target.value })} /></Field>
          <label className="flex gap-2"><input type="checkbox" checked={draft.inheritsCompanyDefaults} onChange={e => patch({ inheritsCompanyDefaults: e.target.checked, workload: e.target.checked ? { ...document.company.defaultWorkload } : draft.workload })} />Herdar padrão da empresa</label>
          <fieldset disabled={draft.inheritsCompanyDefaults} className="space-y-3 disabled:opacity-60">
            <Field label="Regime"><select value={draft.workload.regimeType} onChange={e => workload({ regimeType: e.target.value as "dayBased" | "hourBased" })}><option value="dayBased">Ciclo em dias</option><option value="hourBased">Ciclo em horas</option></select></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Unidades de trabalho"><input type="number" required min="1" max="168" value={draft.workload.workUnits} onChange={e => workload({ workUnits: e.target.valueAsNumber })} /></Field><Field label="Unidades de descanso"><input type="number" required min="0" max="168" value={draft.workload.restUnits} onChange={e => workload({ restUnits: e.target.valueAsNumber })} /></Field></div>
            <Field label="Limite semanal (horas)"><input type="number" required min="1" max="44" value={draft.workload.weeklyLimitHours} onChange={e => workload({ weeklyLimitHours: e.target.valueAsNumber })} /></Field>
            <Field label="Duração do turno"><input type="time" required value={draft.workload.defaultShiftDuration.slice(0,5)} onChange={e => workload({ defaultShiftDuration: e.target.value + ":00" })} /></Field>
          </fieldset>
          <label className="flex gap-2"><input type="checkbox" checked={draft.allowsOvertime} onChange={e => patch({ allowsOvertime: e.target.checked })} />Permitir hora extra</label>
          <label className="flex gap-2"><input type="checkbox" checked={draft.allowsNightWork} onChange={e => patch({ allowsNightWork: e.target.checked })} />Permitir trabalho noturno</label>
          <fieldset><legend className="mb-2 text-sm">Folgas preferidas</legend><div className="flex flex-wrap gap-2">{dayLabels.map((day,i) => <label key={day} className="text-sm"><input type="checkbox" checked={draft.preferredDaysOff.includes(i)} onChange={e => patch({ preferredDaysOff: e.target.checked ? [...draft.preferredDaysOff,i] : draft.preferredDaysOff.filter(d => d !== i) })} /> {day}</label>)}</div></fieldset>
          <Windows title="Disponibilidade" value={draft.availability} onChange={availability => patch({ availability })} />
          <p className="text-xs text-muted-foreground">Sem janelas de disponibilidade, utiliza os horários da operação.</p>
          <Windows title="Bloqueios de horário" value={draft.restrictions} onChange={restrictions => patch({ restrictions })} />
          <section className="space-y-2"><h3>Preferências</h3>{draft.preferences.map((p,i) => <div key={i} className="space-y-2"><Field label="Descrição"><input required value={p.description} onChange={e => patch({ preferences: draft.preferences.map((v,j) => j === i ? { ...v, description: e.target.value } : v) })} /></Field><Field label="Peso"><input type="number" required value={p.weight} onChange={e => patch({ preferences: draft.preferences.map((v,j) => j === i ? { ...v, weight: e.target.valueAsNumber } : v) })} /></Field><Button type="button" onClick={() => patch({ preferences: draft.preferences.filter((_,j) => j !== i) })}>Remover preferência</Button></div>)}<Button type="button" onClick={() => patch({ preferences: [...draft.preferences, { code: crypto.randomUUID(), description: "", weight: 1 }] })}>Adicionar preferência</Button></section>
          {error && <p role="alert" className="text-red-400">{error}</p>}
        </div>
        <footer className="flex flex-wrap gap-2 border-t border-border p-4"><Button type="submit">Salvar funcionário</Button><Button type="button" onClick={() => setSelectedEmployeeId(undefined)}>Cancelar</Button>{!isNew && <Button type="button" onClick={() => { if (window.confirm("Excluir funcionário e todos os seus turnos?")) deleteEmployee(draft.id); }}>Excluir</Button>}</footer>
      </form>
    </aside>
  </div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1 text-sm"><span>{label}</span><div className="[&>input]:w-full [&>input]:rounded [&>input]:border [&>input]:border-border [&>input]:bg-background [&>input]:p-2 [&>select]:w-full [&>select]:bg-background [&>select]:p-2">{children}</div></label>;
}
function Windows({ title, value, onChange }: { title: string; value: AvailabilityWindow[]; onChange: (v: AvailabilityWindow[]) => void }) {
  return <section className="space-y-2"><h3>{title}</h3>{value.map((w,i) => <div key={i} className="space-y-2 rounded border border-border p-2">{(["start", "end"] as const).map(k => <Field key={k} label={k === "start" ? "Início" : "Fim"}><input type="datetime-local" required value={w[k].slice(0,16)} onChange={e => onChange(value.map((v,j) => j === i ? { ...v, [k]: e.target.value + ":00" } : v))} /></Field>)}<Button type="button" onClick={() => onChange(value.filter((_,j) => j !== i))}>Remover janela</Button></div>)}<Button type="button" onClick={() => onChange([...value, { start: "", end: "" }])}>Adicionar janela</Button></section>;
}
