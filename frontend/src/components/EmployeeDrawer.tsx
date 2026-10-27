import { dateTimeInput } from "../lib/dateTime";
import { regimeChoices, regimeDefinition } from "../lib/regimes";
import { TimeInput } from "./TimeInput";
import { DurationInput } from "./DurationInput";
import { useEditorDismiss } from "../lib/useEditorDismiss";
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
  const [draft, setDraft] = useState<Employee>({ ...initial, workload: initial.inheritsCompanyDefaults ? { ...document.company.defaultWorkload } : initial.workload, workingDays: [...(initial.workingDays ?? document.company.operatingDays)] });
  const { requestClose, backdrop } = useEditorDismiss(draft, () => setSelectedEmployeeId(undefined));
  const [error, setError] = useState("");
  const patch = (change: Partial<Employee>) => setDraft(d => ({ ...d, ...change }));
  const workload = (change: Partial<Employee["workload"]>) => patch({ workload: { ...draft.workload, ...change } });
  function save(event: FormEvent) {
    event.preventDefault();
    if (!draft.inheritsCompanyDefaults && !draft.workingDays?.length) { setError("Selecione ao menos um dia de trabalho."); return; }
    if (!document.roles?.some(r => r.id === draft.roleId)) { setError("Selecione uma função cadastrada."); return; }
    if(draft.fixedInterval) {
      const mins=(t:string)=>{const [h,m]=t.split(":").map(Number);return h*60+m;};
      const length=(mins(draft.fixedInterval.end)-mins(draft.fixedInterval.start)+1440)%1440;
      const work=mins((draft.inheritsCompanyDefaults ? document.company.defaultWorkload : draft.workload).defaultShiftDuration);
      const required=work>360 ? 60 : work>240 ? 15 : 0;
      const entry=mins(draft.shiftStartsAt ?? document.company.opensAt);
      const from=(mins(draft.fixedInterval.start)-entry+1440)%1440, to=from+length;
      if(from===0 || to>=work+length) {setError("O intervalo fixo deve ficar dentro da jornada, com trabalho antes e depois.");return;}
      const closure=document.company.middayClosure;
      if(closure) {
        const closedFrom=(mins(closure.start)-entry+1440)%1440,closedTo=closedFrom+(mins(closure.end)-mins(closure.start)+1440)%1440;
        const overlaps=from<closedTo && to>closedFrom;
        if(closedFrom<work+length && (draft.worksDuringLunchClosure ? overlaps : from>closedFrom || to<closedTo)) {setError(draft.worksDuringLunchClosure ? "Quem trabalha durante o fechamento precisa fazer o intervalo fora desse período." : "O intervalo fixo deve cobrir o fechamento da empresa. Ajuste os horários ou autorize o trabalho durante o fechamento.");return;}
      }
      if(length<required || length>120 || length===0) {setError("O intervalo fixo deve respeitar o mínimo da jornada e ter duração de até 2 horas.");return;}
    }
    const employee = { ...draft, shiftStartsAt:draft.shiftStartsAt ?? document.company.opensAt, name: draft.name.trim(), role: draft.role.trim(), workload: draft.inheritsCompanyDefaults ? { ...document.company.defaultWorkload } : draft.workload };
    const result = documentSchema.safeParse({ ...document, employees: [...document.employees.filter(e => e.id !== employee.id), employee] });
    if (!result.success) { setError(result.error.issues[0].message); return; }
    upsertEmployee(employee);
  }
  return <div className="absolute inset-0 z-30 flex justify-end bg-black/40" {...backdrop}>
    <aside role="dialog" aria-modal="true" aria-label={isNew ? "Adicionar funcionário" : "Editar funcionário"} className="h-full w-full max-w-md border-l border-border bg-card shadow-2xl" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); requestClose(); } }}>
      <form onSubmit={save} className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b border-border p-5"><h2 className="text-xl font-semibold">{isNew ? "Adicionar funcionário" : "Editar funcionário"}</h2><Button type="button" onClick={requestClose}>Fechar</Button></header>
        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-5">
          <Field label="Nome"><input autoFocus required value={draft.name} onChange={e => patch({ name: e.target.value })} /></Field>
          <Field label="Função"><select required value={draft.roleId ?? ""} onChange={e => { const role = document.roles?.find(r => r.id === e.target.value); patch({ roleId: role?.id, role: role?.name ?? "" }); }}><option value="">Selecione uma função</option>{document.roles?.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></Field>
          {!isNew && <p className="text-xs text-muted-foreground">Ao mudar a função, todos os turnos deste funcionário, inclusive os antigos e os que estão fora do período selecionado, passam a usar a nova função. Para guardar o registro com a função anterior, exporte a escala antes da alteração.</p>}
          {!document.roles?.length && <p className="text-sm text-muted-foreground">Cadastre uma função na aba Funções antes de adicionar funcionários.</p>}
          <fieldset className="space-y-2 rounded border border-border p-3"><legend>Substituições autorizadas</legend><p className="text-xs text-muted-foreground">Além da própria função, este funcionário pode cobrir as funções marcadas abaixo. A autorização vale só neste sentido: um farmacêutico autorizado pode atender, mas isso não autoriza o atendente a atuar como farmacêutico. Marque apenas funções que ele pode exercer.</p>{document.roles?.filter(r=>r.id!==draft.roleId).map(role=><label key={role.id} className="flex gap-2 text-sm"><input type="checkbox" checked={draft.coverageRoleIds?.includes(role.id) ?? false} onChange={e=>patch({coverageRoleIds:e.target.checked ? [...(draft.coverageRoleIds ?? []),role.id] : draft.coverageRoleIds?.filter(id=>id!==role.id)})} />Pode cobrir {role.name}</label>)}</fieldset>
          <label className="flex gap-2"><input type="checkbox" checked={draft.inheritsCompanyDefaults} onChange={e => patch({ inheritsCompanyDefaults: e.target.checked, workingDays: e.target.checked ? [...document.company.operatingDays] : [...(draft.workingDays ?? document.company.operatingDays)], workload: e.target.checked ? { ...document.company.defaultWorkload } : draft.workload })} />Herdar padrão da empresa</label>
          <fieldset disabled={draft.inheritsCompanyDefaults} className="space-y-2"><legend>Dias de trabalho</legend><div className="flex flex-wrap gap-2">{dayLabels.map((day,i) => <label key={day} className="text-sm"><input type="checkbox" checked={(draft.inheritsCompanyDefaults ? document.company.operatingDays : draft.workingDays ?? document.company.operatingDays).includes(i)} onChange={e => patch({ workingDays: e.target.checked ? [...(draft.workingDays ?? []),i] : draft.workingDays?.filter(d => d !== i) })} /> {day}</label>)}</div></fieldset>
          <p className="text-xs text-muted-foreground">{draft.inheritsCompanyDefaults ? "Dias e jornada acompanham o padrão da empresa." : "Selecione os dias em que pode trabalhar. A empresa também precisa estar aberta nesse dia."} São dias permitidos; a escala ainda respeita jornada e descanso.</p>
          <fieldset disabled={draft.inheritsCompanyDefaults} className="space-y-3 disabled:opacity-60">
            <Field label="Regime"><select value={draft.workload.regimeType} onChange={e => workload({ regimeType: e.target.value as Employee["workload"]["regimeType"] })}>{regimeChoices.map(r=><option key={r.type} value={r.type}>{r.label}</option>)}</select></Field>
            <div className="grid grid-cols-2 gap-3"><Field label={regimeDefinition(draft.workload.regimeType).workLabel}><input type="number" required min="1" max="168" value={draft.workload.workUnits} onChange={e => workload({ workUnits: e.target.valueAsNumber })} /></Field><Field label={regimeDefinition(draft.workload.regimeType).restLabel}><input type="number" required min="0" max="168" value={draft.workload.restUnits} onChange={e => workload({ restUnits: e.target.valueAsNumber })} /></Field></div>
            <Field label="Limite semanal (horas)"><input type="number" required min="1" max="44" value={draft.workload.weeklyLimitHours} onChange={e => workload({ weeklyLimitHours: e.target.valueAsNumber })} /></Field>
            <Field label="Horas de trabalho por dia"><DurationInput required value={draft.workload.defaultShiftDuration} onChange={value => workload({ defaultShiftDuration: value })} /></Field>
          </fieldset>
          <fieldset className="space-y-3 rounded border border-border p-3"><legend>Intervalo do funcionário</legend><label className="flex gap-2"><input type="checkbox" checked={Boolean(draft.fixedInterval)} onChange={e=>patch({fixedInterval:e.target.checked ? {start:document.company.middayClosure?.start ?? "12:00:00",end:document.company.middayClosure?.end ?? "13:00:00"} : undefined})} />Fixar horário de intervalo</label>{draft.fixedInterval && <div className="grid grid-cols-2 gap-3"><Field label="Início do intervalo"><TimeInput required value={draft.fixedInterval.start} onChange={start=>patch({fixedInterval:{...draft.fixedInterval!,start}})} /></Field><Field label="Retorno do intervalo"><TimeInput required value={draft.fixedInterval.end} onChange={end=>patch({fixedInterval:{...draft.fixedInterval!,end}})} /></Field></div>}<p className="text-xs text-muted-foreground">Sem horário fixo, o gerador escolhe início e duração entre os limites da empresa. Com horário fixo, ele respeita a pausa informada, inclusive em turnos que atravessam a meia-noite. Se a pausa não cobrir o fechamento da empresa, autorize o trabalho durante o fechamento abaixo ou ajuste o horário.</p></fieldset><Field label="Entrada fixa"><TimeInput required value={draft.shiftStartsAt ?? document.company.opensAt} onChange={value => patch({shiftStartsAt:value})} /></Field><p className="text-xs text-muted-foreground">O gerador respeita esta entrada. Sem alteração, segue a abertura da empresa.</p><label className="flex gap-2"><input type="checkbox" checked={draft.worksDuringLunchClosure ?? false} onChange={e => patch({worksDuringLunchClosure:e.target.checked})} />Trabalha durante o fechamento para intervalo (exceção manual)</label><p className="text-xs text-muted-foreground">Por padrão, sai para intervalo junto com a equipe. Marque apenas para quem precisa trabalhar nesse período; o intervalo será em outro horário.</p><label className="flex gap-2"><input type="checkbox" checked={draft.allowsOvertime} onChange={e => patch({ allowsOvertime: e.target.checked })} />Permitir hora extra</label>
          <label className="flex gap-2"><input type="checkbox" checked={draft.allowsNightWork} onChange={e => patch({ allowsNightWork: e.target.checked })} />Permitir trabalho noturno</label>
          <fieldset><legend className="mb-2 text-sm">Folgas preferidas</legend><div className="flex flex-wrap gap-2">{dayLabels.map((day,i) => <label key={day} className="text-sm"><input type="checkbox" checked={draft.preferredDaysOff.includes(i)} onChange={e => patch({ preferredDaysOff: e.target.checked ? [...draft.preferredDaysOff,i] : draft.preferredDaysOff.filter(d => d !== i) })} /> {day}</label>)}</div></fieldset>
          <p className="text-xs text-muted-foreground">Folgas preferidas são tentativas de evitar esses dias, sem garantia. Para impedir trabalho em um dia, desmarque-o nos dias de trabalho.</p>
          <Windows title="Períodos em que pode trabalhar" value={draft.availability} onChange={availability => patch({ availability })} />
          <p className="text-xs text-muted-foreground">Disponibilidade: com períodos cadastrados, o turno inteiro deve caber em um deles. Sem períodos, usa os horários da empresa. São datas específicas, sem repetição semanal. Exemplo: 14/10, das 08h às 18h.</p>
          <Windows title="Bloqueios de horário" value={draft.restrictions} onChange={restrictions => patch({ restrictions })} />
          <p className="text-xs text-muted-foreground">Bloqueios impedem qualquer turno que cruze o período, por exemplo uma consulta das 14h às 16h. São datas específicas, sem repetição semanal, e prevalecem sobre a disponibilidade.</p>
          <section className="space-y-2"><h3>Preferências de turno</h3><p className="text-xs text-muted-foreground">A geração tenta atender ao tipo escolhido. O peso indica prioridade: valores maiores favorecem mais essa preferência, sem garantia e sem ultrapassar regras obrigatórias. A descrição é apenas uma anotação.</p>{draft.preferences.map((p,i) => <div key={i} className="space-y-2"><Field label="Tipo de preferência"><select value={p.code} onChange={e => patch({ preferences: draft.preferences.map((v,j) => j === i ? { ...v, code: e.target.value } : v) })}>{!["opening","closing","morning","night"].includes(p.code) && <option value={p.code}>Preferência antiga sem efeito — escolha um tipo</option>}<option value="opening">Abrir a empresa</option><option value="closing">Fechar a empresa</option><option value="morning">Começar antes das 12h</option><option value="night">Trabalhar à noite (precisa estar permitido)</option></select></Field><Field label="Anotação (opcional)"><input value={p.description} onChange={e => patch({ preferences: draft.preferences.map((v,j) => j === i ? { ...v, description: e.target.value } : v) })} /></Field><Field label="Peso (prioridade)"><input type="number" min="1" step="1" required value={p.weight} onChange={e => patch({ preferences: draft.preferences.map((v,j) => j === i ? { ...v, weight: e.target.valueAsNumber } : v) })} /></Field><Button type="button" onClick={() => patch({ preferences: draft.preferences.filter((_,j) => j !== i) })}>Remover preferência</Button></div>)}<Button type="button" onClick={() => patch({ preferences: [...draft.preferences, { code: "opening", description: "", weight: 1 }] })}>Adicionar preferência</Button></section>
          {error && <p role="alert" className="text-red-400">{error}</p>}
        </div>
        <footer className="flex flex-wrap gap-2 border-t border-border p-4"><Button type="submit">Salvar funcionário</Button><Button type="button" onClick={requestClose}>Cancelar</Button>{!isNew && <Button type="button" onClick={() => { if (window.confirm("Excluir funcionário e todos os seus turnos?")) deleteEmployee(draft.id); }}>Excluir</Button>}</footer>
      </form>
    </aside>
  </div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1 text-sm"><span>{label}</span><div className="[&>input]:w-full [&>input]:rounded [&>input]:border [&>input]:border-border [&>input]:bg-background [&>input]:p-2 [&>select]:w-full [&>select]:bg-background [&>select]:p-2">{children}</div></label>;
}
function Windows({ title, value, onChange }: { title: string; value: AvailabilityWindow[]; onChange: (v: AvailabilityWindow[]) => void }) {
  return <section className="space-y-2"><h3>{title}</h3>{value.map((w,i) => <div key={i} className="space-y-2 rounded border border-border p-2">{(["start", "end"] as const).map(k => <Field key={k} label={k === "start" ? "Início" : "Fim"}><input type="datetime-local" required value={dateTimeInput(w[k])} onChange={e => onChange(value.map((v,j) => j === i ? { ...v, [k]: e.target.value + ":00" } : v))} /></Field>)}<Button type="button" onClick={() => onChange(value.filter((_,j) => j !== i))}>Remover janela</Button></div>)}<Button type="button" onClick={() => onChange([...value, { start: "", end: "" }])}>Adicionar janela</Button></section>;
}

