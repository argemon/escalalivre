import { useState, type FormEvent, type ReactNode } from "react";
import { useScheduleStore } from "../store/scheduleStore";
import { documentSchema } from "../lib/documentSchema";
import { dayLabels } from "../lib/planning";
import type { CompanyRules } from "../types/schedule";
import { groupCoverageRules, expandCoverageRules, type CoverageDraft } from "../lib/coverageRules";
import { Button } from "./ui";

export function CompanyEditor({ tab, onClose }: { tab: "company" | "coverage"; onClose: () => void }) {
  const { document, setDocument } = useScheduleStore();
  const [company,setCompany] = useState<CompanyRules>(() => structuredClone(document.company));
  const [coverage, setCoverage] = useState<CoverageDraft[]>(() => groupCoverageRules(document.company.coverage));
  const [error,setError] = useState("");
  const patch = (v: Partial<CompanyRules>) => setCompany(c => ({ ...c,...v }));
  const workload = (v: Partial<CompanyRules["defaultWorkload"]>) => patch({ defaultWorkload: { ...company.defaultWorkload,...v } });
  function save(e: FormEvent) {
    e.preventDefault();
    if (!company.operatingDays.length) { setError("Selecione ao menos um dia de funcionamento."); return; }
    if (company.minimumRest < "11:00:00") { setError("O descanso mínimo deve ser de pelo menos 11 horas."); return; }
    if (company.lunch.maximum < company.lunch.minimum) { setError("O almoço máximo deve ser maior ou igual ao mínimo."); return; }
    if (tab === "coverage" && coverage.some(rule => rule.days.length === 0)) { setError("Selecione ao menos um dia para cada regra de cobertura."); return; }
    const normalized = { ...company,name:company.name.trim(),coverage:tab === "coverage" ? expandCoverageRules(coverage) : company.coverage };
    const next = { ...document,company:normalized,employees: document.employees.map(e => e.inheritsCompanyDefaults ? { ...e,workload: { ...company.defaultWorkload } } : e), updatedAt:new Date().toISOString() };
    const validation = documentSchema.safeParse(next);
    if (!validation.success) { setError(validation.error.issues[0].message); return; }
    setDocument(next); onClose();
  }
  const time = (label: string,value: string,onChange: (s:string) => void) => <Field label={label}><input required type="time" value={value.slice(0,5)} onChange={e => onChange(e.target.value+":00")} /></Field>;
  return <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
    <form role="dialog" aria-modal="true" aria-label={tab === "company" ? "Configurar empresa" : "Configurar cobertura mínima"} onSubmit={save} onClick={e => e.stopPropagation()} onKeyDown={e => { if(e.key === "Escape") onClose(); }} className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg border border-border bg-card shadow-xl">
      <header className="flex items-center justify-between border-b border-border p-4"><h2 className="text-xl font-semibold">{tab === "company" ? "Configurar empresa" : "Cobertura mínima"}</h2><Button type="button" onClick={onClose}>Fechar</Button></header>
      <div className="space-y-4 overflow-auto p-4">
      {tab === "company" ? <>
        <Field label="Nome da empresa"><input autoFocus required value={company.name} onChange={e => patch({name:e.target.value})} /></Field>
        <div className="grid grid-cols-2 gap-3">{time("Abertura",company.opensAt,v => patch({opensAt:v}))}{time("Fechamento",company.closesAt,v => patch({closesAt:v}))}</div>
        <fieldset><legend>Dias de funcionamento</legend><div className="mt-2 flex flex-wrap gap-3">{dayLabels.map((d,i) => <label key={d}><input type="checkbox" checked={company.operatingDays.includes(i)} onChange={e => patch({operatingDays:e.target.checked ? [...company.operatingDays,i].sort() : company.operatingDays.filter(v => v !== i)})} /> {d}</label>)}</div></fieldset>
        {time("Descanso mínimo entre turnos",company.minimumRest,v => patch({minimumRest:v}))}
        <Field label="Regime padrão"><select value={company.defaultWorkload.regimeType} onChange={e => workload({regimeType:e.target.value as "dayBased" | "hourBased"})}><option value="dayBased">Ciclo em dias</option><option value="hourBased">Ciclo em horas</option></select></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Unidades de trabalho"><input required type="number" min="1" max="168" value={company.defaultWorkload.workUnits} onChange={e => workload({workUnits:e.target.valueAsNumber})} /></Field><Field label="Unidades de descanso"><input required type="number" min="0" max="168" value={company.defaultWorkload.restUnits} onChange={e => workload({restUnits:e.target.valueAsNumber})} /></Field></div>
        <Field label="Limite semanal (horas)"><input required type="number" min="1" max="44" value={company.defaultWorkload.weeklyLimitHours} onChange={e => workload({weeklyLimitHours:e.target.valueAsNumber})} /></Field>
        {time("Duração padrão do turno",company.defaultWorkload.defaultShiftDuration,v => workload({defaultShiftDuration:v}))}
        <h3 className="font-semibold">Almoço</h3><div className="grid grid-cols-3 gap-3">{time("Mínimo",company.lunch.minimum,v => patch({lunch:{...company.lunch,minimum:v}}))}{time("Máximo",company.lunch.maximum,v => patch({lunch:{...company.lunch,maximum:v}}))}{time("Preferencial após",company.lunch.preferredAfter,v => patch({lunch:{...company.lunch,preferredAfter:v}}))}</div>
      </> : <>
        <p className="text-sm text-muted-foreground">Defina quantas pessoas de cada função devem estar trabalhando no período. Selecione todos os dias em que a regra deve valer. O cálculo desconta os intervalos de almoço.</p>
        {coverage.length === 0 && <p>Nenhuma regra cadastrada.</p>}
        {coverage.map((rule,i) => {
          const change = (v: Partial<typeof rule>) => setCoverage(rules => rules.map((r,j) => j === i ? {...r,...v} : r));
          return <fieldset key={i} className="space-y-3 rounded border border-border p-3"><legend>Regra {i+1}</legend><div className="grid grid-cols-2 gap-3"><Field label="Função"><input autoFocus={i === 0} required value={rule.role} list="coverage-roles" onChange={e => change({role:e.target.value})} /></Field><fieldset className="col-span-2 space-y-2"><legend className="text-sm font-medium">Dias em que esta regra vale</legend>
            <div className="flex flex-wrap gap-2"><Button type="button" onClick={() => change({days:[0,1,2,3,4,5,6]})}>Todos os dias</Button><Button type="button" onClick={() => change({days:[...company.operatingDays]})}>Dias de funcionamento</Button></div>
            <div className="flex flex-wrap gap-2">{dayLabels.map((label,day) => <label key={day} className={"flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm " + (rule.days.includes(day) ? "border-primary bg-primary/10 text-primary" : "border-border bg-background")}><input type="checkbox" checked={rule.days.includes(day)} onChange={e => change({days:e.target.checked ? [...rule.days,day].sort((a,b) => a-b) : rule.days.filter(d => d !== day)})} />{label}</label>)}</div>
            <p className="text-xs text-muted-foreground">O mesmo horário e a mesma quantidade de pessoas serão aplicados a todos os dias selecionados.</p>
          </fieldset>{time("Início",rule.start,v => change({start:v}))}{time("Fim",rule.end,v => change({end:v}))}<Field label="Quantidade mínima"><input required type="number" min="0" max="200" value={rule.minimumEmployees} onChange={e => change({minimumEmployees:e.target.valueAsNumber})} /></Field></div><Button type="button" onClick={() => setCoverage(rules => rules.filter((_,j) => j !== i))}>Remover regra</Button></fieldset>;
        })}
        <datalist id="coverage-roles">{Array.from(new Set(document.employees.map(e => e.role))).map(role => <option key={role} value={role} />)}</datalist>
        <Button type="button" onClick={() => setCoverage(rules => [...rules,{role:"",days:[...company.operatingDays],start:company.opensAt,end:company.closesAt,minimumEmployees:1}])}>Adicionar regra de cobertura</Button>
      </>}
      {error && <p role="alert" className="text-red-400">{error}</p>}
      </div><footer className="flex gap-2 border-t border-border p-4"><Button type="submit">Salvar alterações</Button><Button type="button" onClick={onClose}>Cancelar</Button></footer>
    </form>
  </div>;
}
function Field({label,children}: {label:string;children:ReactNode}) {
  return <label className="block space-y-1 text-sm"><span>{label}</span><div className="[&>input]:w-full [&>input]:rounded [&>input]:border [&>input]:border-border [&>input]:bg-background [&>input]:p-2 [&>select]:w-full [&>select]:rounded [&>select]:bg-background [&>select]:p-2">{children}</div></label>;
}
