import { AbsenceEditor } from "./AbsenceEditor";
import { employeeOn } from "../lib/policies/employment";
import { EmploymentEditor } from "./EmploymentEditor";
import { duplicateEmployee, priorities } from "../lib/teamOperations";
import { canCover, inheritedCoverageRoleIds } from "../lib/coverageAllocation";
import { WeeklyWorkPlanEditor } from "./WeeklyWorkPlanEditor";
import { EmployeeShiftEditor } from "./EmployeeShiftEditor";
import { EmployeeScheduleEditor } from "./EmployeeScheduleEditor";
import { automaticDayCount } from "../lib/policies/employeeSchedule";
import { secondsDuration, durationSeconds, intervalDescription } from "../lib/policies/weeklyWorkPlan";
import { dateTimeInput } from "../lib/dateTime";
import { regimeChoices, regimeDefinition } from "../lib/regimes";
import { TimeInput } from "./TimeInput";
import { DurationInput } from "./DurationInput";
import { durationToHours, hoursToDuration } from "../lib/duration";
import { useEditorDismiss } from "../lib/useEditorDismiss";
import { useDialogFocus } from "../lib/useDialogFocus";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
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
  const [draft, setDraft] = useState<Employee>({ ...initial, workload: initial.inheritsCompanyDefaults ? { ...document.company.defaultWorkload } : initial.workload, workingDays: initial.workingDays ? [...initial.workingDays] : undefined });
  const { requestClose, backdrop } = useEditorDismiss(draft, () => setSelectedEmployeeId(undefined));
  const dialogRef=useRef<HTMLElement>(null);useDialogFocus(dialogRef,requestClose);
  const [error, setError] = useState("");
  const [copyName,setCopyName]=useState<string|null>(null);
  const patch = (change: Partial<Employee>) => setDraft(d => ({ ...d, ...change }));
  const effective=employeeOn(draft,document.planningPeriod.start);
  const setCoverage=(coverageRoleIds:string[])=>{const tenure=draft.roleHistory?.filter(t=>t.startsOn<=document.planningPeriod.start).sort((a,b)=>b.startsOn.localeCompare(a.startsOn))[0];patch(tenure?{roleHistory:draft.roleHistory!.map(t=>t.startsOn===tenure.startsOn?{...t,coverageRoleIds}:t)}:{coverageRoleIds});};
  const workload = (change: Partial<Employee["workload"]>) => patch({ workload: { ...draft.workload, ...change } });
  function save(event: FormEvent) {
    event.preventDefault();
    if (!draft.inheritsCompanyDefaults && draft.workingDays && !draft.workingDays.length) { setError("Selecione ao menos um dia de trabalho."); return; }
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
    if(copyName!==null){try{upsertEmployee(duplicateEmployee(employeeOn(employee,document.planningPeriod.start),crypto.randomUUID(),copyName));}catch(e){setError((e as Error).message);}return;}
    upsertEmployee(employee);
  }
  return <div className="absolute inset-0 z-30 flex justify-start bg-black/40" {...backdrop}>
    <aside ref={dialogRef} role="dialog" aria-modal="true" aria-label={isNew ? "Adicionar funcionário" : "Editar funcionário"} className="h-full w-full max-w-md border-r border-border bg-card shadow-2xl" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); requestClose(); } }}>
      <form onSubmit={save} className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b border-border p-5"><h2 className="text-xl font-semibold">{isNew ? "Adicionar funcionário" : "Editar funcionário"}</h2><Button type="button" onClick={requestClose}>Fechar</Button></header>
        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-5">
          <Field label="Nome"><input autoFocus required value={draft.name} onChange={e => patch({ name: e.target.value })} /></Field>
          <Field label="Função"><select disabled={!isNew} required value={effective.roleId ?? ""} onChange={e => { const role = document.roles?.find(r => r.id === e.target.value); patch({ roleId: role?.id, role: role?.name ?? "" }); }}><option value="">Selecione uma função</option>{document.roles?.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></Field>
          {!isNew && <p className="text-xs text-muted-foreground">Função de origem preservada. Use a alteração com vigência abaixo para registrar uma nova função sem reescrever o histórico.</p>}
          {!document.roles?.length && <p className="text-sm text-muted-foreground">Cadastre uma função na aba Funções antes de adicionar funcionários.</p>}
          <EmployeeScheduleEditor employee={draft} company={document.company} end={document.planningPeriod.end} onChange={setDraft} />
          <p className="text-sm">Resumo: {draft.inheritsCompanyDefaults ? "Padrão da empresa" : draft.workload.workUnits+" dias de trabalho / "+draft.workload.restUnits+" de descanso"} · jornada diária {(draft.inheritsCompanyDefaults ? document.company.defaultWorkload : draft.workload).defaultShiftDuration} · {(draft.inheritsCompanyDefaults ? document.company.defaultWorkload : draft.workload).weeklyPlan ? ((draft.inheritsCompanyDefaults ? document.company.defaultWorkload : draft.workload).weeklyPlan!.contractedSeconds/3600)+"h semanais contratadas" : "sem meta contratada"} · máximo {(draft.inheritsCompanyDefaults ? document.company.defaultWorkload : draft.workload).weeklyLimitHours}h · intervalo {draft.fixedInterval ? draft.fixedInterval.start+"–"+draft.fixedInterval.end : intervalDescription(document.company.lunch)}. Confira dias e horas; o modelo não certifica enquadramento jurídico.</p>
          <details className="space-y-3"><summary>Opções avançadas · {draft.preferences.length} preferências, {draft.restrictions.length} bloqueios, {draft.contractLeaves?.length??0} dispensas{draft.allowsOvertime ? ", extras" : ""}{draft.allowsNightWork ? ", noturno" : ""}{draft.fixedInterval ? ", intervalo fixo" : ""}{draft.availability.length ? ", disponibilidade limitada" : ""}{draft.coverageRoleIds?.length ? ", substituições" : ""}</summary>
          {!isNew && <details className="space-y-3"><summary>Ajustar saída dos turnos salvos</summary><p className="text-xs text-muted-foreground">Cada saída é salva imediatamente pelo botão abaixo. A carga contratada continua prevista; sair antes gera horas faltantes. Para uma dispensa de carga, registre-a explicitamente no cadastro. O saldo representa planejamento, sem desconto salarial ou banco de horas automático.</p>{document.assignments.filter(a=>a.employeeId===initial.id && a.start.slice(0,10)>=document.planningPeriod.start && a.start.slice(0,10)<=document.planningPeriod.end).map(a=><EmployeeShiftEditor key={a.id+a.end} shift={a} />)}</details>}
          <fieldset className="space-y-2 rounded border border-border p-3"><legend>Substituições individuais</legend><p className="text-xs text-muted-foreground">As marcações abaixo autorizam este funcionário a cobrir outras funções, além das permissões herdadas da sua função. A autorização vale só neste sentido: um farmacêutico autorizado pode atender, mas isso não autoriza o atendente a atuar como farmacêutico. A alocação depende do modo de cobertura do arquivo: substituição exclusiva ou grupo simultâneo explícito; arquivos legados mantêm presença simultânea até conversão. Na pausa, não conta para nenhuma. Marque apenas funções que ele pode exercer.</p><p className="text-xs text-muted-foreground">{inheritedCoverageRoleIds(effective,document.roles).length ? "Autorizado pela função: " + document.roles?.filter(r=>inheritedCoverageRoleIds(effective,document.roles).includes(r.id)).map(r=>r.name).join(", ") + ". Para remover essa permissão de todos, edite a função na etapa Funções." : "A função atual não tem substituições autorizadas."} As autorizações individuais são adicionais; desmarcá-las não remove as permissões da função.</p>{document.roles?.filter(r=>r.id!==effective.roleId).map(role=><label key={role.id} className="flex gap-2 text-sm"><input type="checkbox" checked={effective.coverageRoleIds?.includes(role.id) ?? false} onChange={e=>setCoverage(e.target.checked ? [...(effective.coverageRoleIds ?? []),role.id] : (effective.coverageRoleIds??[]).filter(id=>id!==role.id))} />Pode cobrir {role.name}</label>)}</fieldset>
          {document.company.coverageMode==="exclusive"&&<fieldset className="space-y-2 border border-border p-2"><legend>Grupo de acumulação ativo</legend><p className="text-xs">Opcional. Escolha explicitamente duas ou mais funções que esta pessoa pode atender juntas. Somente essas funções contribuem enquanto o grupo estiver ativo; outras permissões não são acumuladas. Desative o grupo para voltar à substituição exclusiva. Uma função sem autorização não contribui.</p><label className="block"><input type="checkbox" checked={Boolean(draft.accumulationRoleIds?.length)} onChange={e=>patch({accumulationRoleIds:e.target.checked?[effective.roleId!]:undefined})}/> Ativar um grupo simultâneo</label>{Boolean(draft.accumulationRoleIds?.length)&&document.roles?.map(role=>{const authorized=canCover(effective,{role:role.name,roleId:role.id,day:0,start:"00:00:00",end:"01:00:00",minimumEmployees:1},document.roles),selected=draft.accumulationRoleIds!.includes(role.id);return <label className="block" key={role.id}><input type="checkbox" checked={selected} disabled={!authorized&&!selected} onChange={e=>patch({accumulationRoleIds:e.target.checked?[...draft.accumulationRoleIds!,role.id]:draft.accumulationRoleIds!.filter(id=>id!==role.id)})}/> {role.name}{!authorized&&" (sem autorização)"}</label>;})}</fieldset>}
          <label className="flex gap-2"><input type="checkbox" checked={draft.inheritsCompanyDefaults} onChange={e => patch({ inheritsCompanyDefaults: e.target.checked, workingDays: e.target.checked ? [...document.company.operatingDays] : [...(draft.workingDays ?? document.company.operatingDays)], workload: e.target.checked ? { ...document.company.defaultWorkload } : draft.workload })} />Herdar padrão da empresa</label>
          <fieldset disabled={draft.inheritsCompanyDefaults} className="space-y-3 disabled:opacity-60">
            <WeeklyWorkPlanEditor value={draft.workload.weeklyPlan} onChange={weeklyPlan=>workload({weeklyPlan:weeklyPlan&&automaticDayCount(draft)?{...weeklyPlan,flexibleWorkDays:automaticDayCount(draft)}:weeklyPlan})} ceiling={draft.workload.weeklyLimitHours} entry={draft.shiftStartsAt ?? document.company.opensAt} pause={document.company.lunch.minimum} />
            <fieldset disabled={Boolean(draft.workload.weeklyPlan?.flexibleWorkDays)} className="space-y-3 disabled:opacity-60"><legend>Configuração do ciclo (personalizada)</legend><Field label="Regime"><select value={draft.workload.regimeType} onChange={e => workload({ regimeType: e.target.value as Employee["workload"]["regimeType"] })}>{regimeChoices.map(r=><option key={r.type} value={r.type}>{r.label}</option>)}</select></Field>
            <div className="grid grid-cols-2 gap-3">{(["workUnits", "restUnits"] as const).map(unit => <Field key={unit} label={unit === "workUnits" ? regimeDefinition(draft.workload.regimeType).workLabel : regimeDefinition(draft.workload.regimeType).restLabel}>
              {draft.workload.regimeType === "hourBased"
                ? <DurationInput required value={hoursToDuration(draft.workload[unit])} pattern="[0-9]{1,3}:00(?::00)?" title="Informe horas inteiras no formato HH:00 (até 168 horas)." onChange={value => workload({ [unit]: durationToHours(value) })} />
                : <input type="number" required min={unit === "workUnits" ? 1 : 0} max="168" value={draft.workload[unit]} onChange={e => workload({ [unit]: e.target.valueAsNumber })} />}
            </Field>)}</div>
            </fieldset>
            <Field label="Máximo semanal, incluindo extras (horas)"><input type="number" required min="1" max="168" step="0.01" value={draft.workload.weeklyLimitHours} onChange={e => workload({ weeklyLimitHours: e.target.valueAsNumber })} /></Field>
            <p className="text-xs text-muted-foreground">O máximo limita o trabalho líquido de domingo a sábado, incluindo extras autorizadas e histórico. Não é uma meta. Exemplo: mínimo 40h e máximo 48h permitem até 8h além do contrato, respeitando cada limite diário e descanso. Sem permitir extras, continua valendo o teto normal de até 44h. O limite de cadastro de 168h é estrutural e não autoriza essa jornada.</p>
            {!draft.workload.weeklyPlan && <Field label="Horas de trabalho por dia"><DurationInput required value={draft.workload.defaultShiftDuration} onChange={value => workload({ defaultShiftDuration: value })} /></Field>}
          </fieldset>
          <fieldset className="space-y-3 rounded border border-border p-3"><legend>Intervalo do funcionário</legend><p>{intervalDescription(document.company.lunch)}. Intervalo individual substitui essa faixa; fechamento e pausa obrigatória continuam valendo.</p><label className="flex gap-2"><input type="checkbox" checked={Boolean(draft.fixedInterval)} onChange={e=>patch({fixedInterval:e.target.checked ? {start:document.company.middayClosure?.start ?? "12:00:00",end:document.company.middayClosure?.end ?? "13:00:00"} : undefined})} />Fixar horário de intervalo</label>{draft.fixedInterval && <div className="grid grid-cols-2 gap-3"><Field label="Início do intervalo"><TimeInput required value={draft.fixedInterval.start} onChange={start=>patch({fixedInterval:{...draft.fixedInterval!,start}})} /></Field><Field label="Retorno do intervalo"><TimeInput required value={draft.fixedInterval.end} onChange={end=>patch({fixedInterval:{...draft.fixedInterval!,end}})} /></Field></div>}<p className="text-xs text-muted-foreground">Sem horário fixo, o gerador escolhe início e duração entre os limites da empresa. Com horário fixo, ele respeita a pausa informada, inclusive em turnos que atravessam a meia-noite. Se a pausa não cobrir o fechamento da empresa, autorize o trabalho durante o fechamento abaixo ou ajuste o horário.</p></fieldset><Field label="Entrada fixa"><TimeInput required value={draft.shiftStartsAt ?? document.company.opensAt} onChange={value => patch({shiftStartsAt:value})} /></Field><p className="text-xs text-muted-foreground">O gerador respeita esta entrada. Sem alteração, segue a abertura da empresa.</p><label className="flex gap-2"><input type="checkbox" checked={draft.worksDuringLunchClosure ?? false} onChange={e => patch({worksDuringLunchClosure:e.target.checked})} />Trabalha durante o fechamento para intervalo (exceção manual)</label><p className="text-xs text-muted-foreground">Por padrão, sai para intervalo junto com a equipe. Marque apenas para quem precisa trabalhar nesse período; o intervalo será em outro horário.</p><label className="flex gap-2"><input type="checkbox" checked={draft.allowsOvertime} onChange={e => patch({ allowsOvertime: e.target.checked })} />Permitir hora extra</label>
          <label className="flex gap-2"><input type="checkbox" checked={draft.allowsNightWork} onChange={e => patch({ allowsNightWork: e.target.checked })} />Permitir trabalho noturno</label>
          <fieldset><legend className="mb-2 text-sm">Folgas preferidas</legend><div className="flex flex-wrap gap-2">{dayLabels.map((day,i) => <label key={day} className="text-sm"><input type="checkbox" checked={draft.preferredDaysOff.includes(i)} onChange={e => patch({ preferredDaysOff: e.target.checked ? [...draft.preferredDaysOff,i] : draft.preferredDaysOff.filter(d => d !== i) })} /> {day}</label>)}</div></fieldset>
          <p className="text-xs text-muted-foreground">Folgas preferidas são tentativas de evitar esses dias, sem garantia. Para impedir trabalho em um dia, desmarque-o nos dias de trabalho.</p>
          <Windows title="Limitar trabalho a datas e horários específicos (opcional)" value={draft.availability} onChange={availability => patch({ availability })} />
          <p className="text-xs text-muted-foreground">Deixe vazio se a pessoa segue os dias e horários de trabalho configurados acima. Preencha apenas se ela só puder trabalhar em datas e horários específicos. Exemplo: ao adicionar 14/10, das 08h às 18h, ela só poderá ser escalada dentro desse período e não nos outros dias. Adicione todos os períodos permitidos; eles não se repetem a cada semana. Para impedir apenas uma ausência, como uma consulta, use Bloqueios de horário abaixo.</p>
          <section className="space-y-2"><h3>Afastamentos com dispensa de carga</h3><p className="text-xs">Registre a data e o trabalho líquido dispensado (sem intervalo). Dispensa limitada à carga prevista do dia, sem reposição automática. Para impedir horários específicos, registre também um bloqueio abaixo. Bloqueios sozinhos não dispensam carga.</p>{draft.contractLeaves?.map((leave,i)=><div key={i}><label>Data<input required type="date" value={leave.date} onChange={e=>patch({contractLeaves:draft.contractLeaves!.map((v,j)=>i===j?{...v,date:e.target.value}:v)})} /></label><label>Trabalho líquido dispensado<DurationInput showSeconds required value={secondsDuration(leave.excusedSeconds)} onChange={value=>patch({contractLeaves:draft.contractLeaves!.map((v,j)=>i===j?{...v,excusedSeconds:durationSeconds(value)}:v)})} /></label><Button type="button" onClick={()=>patch({contractLeaves:draft.contractLeaves!.filter((_,j)=>i!==j)})}>Remover dispensa</Button></div>)}<Button type="button" onClick={()=>patch({contractLeaves:[...(draft.contractLeaves??[]),{date:document.planningPeriod.start,excusedSeconds:28800}]})}>Adicionar dispensa de carga</Button></section>
          <Windows title="Bloqueios de horário" value={draft.restrictions} onChange={restrictions => patch({ restrictions })} />
          <p className="text-xs text-muted-foreground">Bloqueios impedem qualquer turno que cruze o período, por exemplo uma consulta das 14h às 16h. São datas específicas, sem repetição semanal, e prevalecem sobre a disponibilidade.</p>
          <section className="space-y-2"><h3>Preferências de turno</h3><p className="text-xs text-muted-foreground">A geração tenta atender ao tipo escolhido. O peso indica prioridade: valores maiores favorecem mais essa preferência, sem garantia e sem ultrapassar regras obrigatórias. A descrição é apenas uma anotação.</p>{draft.preferences.map((p,i) => <div key={i} className="space-y-2"><Field label="Tipo de preferência"><select value={p.code} onChange={e => patch({ preferences: draft.preferences.map((v,j) => j === i ? { ...v, code: e.target.value } : v) })}>{!["opening","closing","morning","night"].includes(p.code) && <option value={p.code}>Preferência antiga sem efeito — escolha um tipo</option>}<option value="opening">Abrir a empresa</option><option value="closing">Fechar a empresa</option><option value="morning">Começar antes das 12h</option><option value="night">Trabalhar à noite (precisa estar permitido)</option></select></Field><Field label="Anotação (opcional)"><input value={p.description} onChange={e => patch({ preferences: draft.preferences.map((v,j) => j === i ? { ...v, description: e.target.value } : v) })} /></Field><Field label="Prioridade"><select value={p.weight} onChange={e => patch({ preferences: draft.preferences.map((v,j) => j === i ? { ...v, weight: Number(e.target.value) } : v) })}>{!priorities.some(v=>v.weight===p.weight)&&<option value={p.weight}>Personalizada ({p.weight})</option>}{priorities.map(v=><option key={v.weight} value={v.weight}>{v.label} ({v.weight})</option>)}</select></Field><Button type="button" onClick={() => patch({ preferences: draft.preferences.filter((_,j) => j !== i) })}>Remover preferência</Button></div>)}<Button type="button" onClick={() => patch({ preferences: [...draft.preferences, { code: "opening", description: "", weight: 1 }] })}>Adicionar preferência</Button></section>
          </details>
          {!isNew && <><p className="text-xs">{initial.inactiveFrom ? "Inativo a partir de "+initial.inactiveFrom : "Pessoa ativa"}. {initial.roleHistory?.map(t=>t.startsOn+": "+t.role).join(" · ")}</p><EmploymentEditor ids={[initial.id]} /><AbsenceEditor employeeId={initial.id} /></>}
          {!isNew && <section><Button type="button" onClick={()=>setCopyName(copyName===null ? "" : null)}>Duplicar funcionário</Button>{copyName!==null&&<Field label="Nome obrigatório da nova pessoa"><input required value={copyName} onChange={e=>setCopyName(e.target.value)} /></Field>}<p className="text-xs">A duplicação copia somente configurações recorrentes; turnos e eventos datados ficam com a pessoa original.</p></section>}
          {error && <p role="alert" className="text-red-400">{error}</p>}
        </div>
        <footer className="flex flex-wrap gap-2 border-t border-border p-4"><Button type="submit">{copyName===null ? "Salvar funcionário" : "Criar cópia com novo nome"}</Button><Button type="button" onClick={requestClose}>Cancelar</Button>{!isNew && <Button type="button" onClick={() => { if (window.confirm("Excluir funcionário e todos os seus turnos?")) deleteEmployee(draft.id); }}>Excluir</Button>}</footer>
      </form>
    </aside>
  </div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex flex-col gap-1 text-sm"><span className="flex-1">{label}</span><div className="[&>input]:w-full [&>input]:rounded [&>input]:border [&>input]:border-border [&>input]:bg-background [&>input]:p-2 [&>select]:w-full [&>select]:bg-background [&>select]:p-2">{children}</div></label>;
}
function Windows({ title, value, onChange }: { title: string; value: AvailabilityWindow[]; onChange: (v: AvailabilityWindow[]) => void }) {
  return <section className="space-y-2"><h3>{title}</h3>{value.map((w,i) => <div key={i} className="space-y-2 rounded border border-border p-2">{(["start", "end"] as const).map(k => <Field key={k} label={k === "start" ? "Início" : "Fim"}><input type="datetime-local" required value={dateTimeInput(w[k])} onChange={e => onChange(value.map((v,j) => j === i ? { ...v, [k]: e.target.value + ":00" } : v))} /></Field>)}<Button type="button" onClick={() => onChange(value.filter((_,j) => j !== i))}>Remover período</Button></div>)}<Button type="button" onClick={() => onChange([...value, { start: "", end: "" }])}>Adicionar período</Button></section>;
}

