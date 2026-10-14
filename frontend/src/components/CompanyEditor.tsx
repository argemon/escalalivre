import { TimeInput } from "./TimeInput";
import { useEditorDismiss } from "../lib/useEditorDismiss";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useScheduleStore } from "../store/scheduleStore";
import { documentSchema } from "../lib/documentSchema";
import { dayLabels } from "../lib/planning";
import type { CompanyRules } from "../types/schedule";
import { groupCoverageRules, expandCoverageRules, outsideOperatingHours, syncOperatingCoverage, type CoverageDraft } from "../lib/coverageRules";
import { Button } from "./ui";

export function CompanyEditor({ tab, onClose, onSaved }: { tab: "company" | "coverage"; onClose: () => void; onSaved?: () => void }) {
  const { document, setDocument } = useScheduleStore();
  const [company,setCompany] = useState<CompanyRules>(() => structuredClone(document.company));
  const [coverage, setCoverage] = useState<CoverageDraft[]>(() => groupCoverageRules(document.company.coverage).map(rule => ({...rule, daysMode: rule.daysMode ?? (rule.days.length === document.company.operatingDays.length && rule.days.every(day => document.company.operatingDays.includes(day)) ? "operating" : "custom")})));
  const { requestClose, backdrop } = useEditorDismiss({ company, coverage }, onClose);
  const rulesContainer = useRef<HTMLDivElement>(null);
  const revealNewRule = useRef(false);
  useEffect(() => {
    if (!revealNewRule.current) return;
    revealNewRule.current = false;
    const rule = rulesContainer.current?.querySelector<HTMLElement>('[data-coverage-rule]:last-of-type');
    rule?.scrollIntoView({ block: "start", behavior: "smooth" });
    rule?.querySelector<HTMLSelectElement>('select')?.focus({ preventScroll: true });
  }, [coverage.length]);
  const [error,setError] = useState("");
  const patch = (v: Partial<CompanyRules>) => setCompany(c => ({ ...c,...v }));
  const workload = (v: Partial<CompanyRules["defaultWorkload"]>) => patch({ defaultWorkload: { ...company.defaultWorkload,...v } });
  function save(e: FormEvent) {
    e.preventDefault();
    if (!company.operatingDays.length) { setError("Selecione ao menos um dia de funcionamento."); return; }
    if (company.minimumRest < "11:00:00") { setError("O descanso mínimo deve ser de pelo menos 11 horas."); return; }
    if (company.lunch.maximum > "02:00:00" || company.lunch.minimum > "02:00:00") { setError("Intervalos acima de 2 horas exigem acordo escrito ou contrato coletivo. Este planejador usa o limite geral de 2 horas."); return; }
    if (company.lunch.maximum < company.lunch.minimum) { setError("O intervalo máximo deve ser maior ou igual ao mínimo."); return; }
    if (tab === "coverage" && coverage.some(rule => rule.days.length === 0)) { setError("Selecione ao menos um dia para cada regra de cobertura."); return; }
    if (company.middayClosure) {
      const minutes = (v: string) => { const [h,m] = v.split(":").map(Number); return h*60+m; };
      const open = minutes(company.opensAt), close = minutes(company.closesAt)+(company.closesAt <= company.opensAt ? 1440 : 0);
      const start = minutes(company.middayClosure.start)+(minutes(company.middayClosure.start) < open ? 1440 : 0), end = minutes(company.middayClosure.end)+(minutes(company.middayClosure.end) < open ? 1440 : 0);
      if (end-start > 120) { setError("O intervalo de fechamento não pode exceder 2 horas neste planejador."); return; }
      if (start <= open || end >= close || end <= start) { setError("O fechamento para intervalo deve começar e terminar dentro do expediente, com retorno após a saída."); return; }
    }
    if (tab === "coverage" && coverage.some(rule => !rule.allowsOutsideHours && rule.days.some(day => outsideOperatingHours(company, day, rule.start, rule.end)))) { setError("Cobertura fora do expediente: ajuste os dias/horários ou marque explicitamente a autorização para esta função."); return; }
    if (tab === "coverage" && coverage.some(rule => rule.scope !== "team" && !document.roles?.some(r => r.id === rule.roleId))) { setError("Selecione uma função cadastrada para cada regra."); return; }
    const normalized = { ...company,name:company.name.trim(),coverage:tab === "coverage" ? expandCoverageRules(coverage) : syncOperatingCoverage(document.company, company) };
    const next = { ...document, setup: { companyConfigured: tab === "company" || document.setup?.companyConfigured === true },company:normalized,employees: document.employees.map(e => e.inheritsCompanyDefaults ? { ...e,workload: { ...company.defaultWorkload } } : e), updatedAt:new Date().toISOString() };
    const validation = documentSchema.safeParse(next);
    if (!validation.success) { setError(validation.error.issues[0].message); return; }
    setDocument(next); onSaved?.(); onClose();
  }
  const time = (label: string,value: string,onChange: (s:string) => void) => <Field label={label}><TimeInput required value={value} onChange={onChange} /></Field>;
  const intervalClosure = <><h3 className="font-semibold">Fechamento da empresa para intervalo</h3><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(company.middayClosure)} onChange={e => patch({middayClosure:e.target.checked ? {start:"12:00:00",end:"13:00:00"} : undefined})} />A empresa fecha para intervalo</label>{company.middayClosure && <><div className="grid grid-cols-2 gap-3">{time("Fecha para intervalo",company.middayClosure.start,v => patch({middayClosure:{...company.middayClosure!,start:v}}))}{time("Reabre após intervalo",company.middayClosure.end,v => patch({middayClosure:{...company.middayClosure!,end:v}}))}</div><p className="text-xs text-muted-foreground">A cobertura normal não é exigida durante o fechamento. Turnos que atravessarem esse horário terão pausas que cobrem todo o fechamento. Fora desse período, o gerador alterna as pausas conforme a demanda.</p></>}<p className="text-sm text-muted-foreground">Todos saem para intervalo durante o fechamento. Para um estoquista ou outra exceção, abra o funcionário e marque “Trabalha durante o fechamento para intervalo”. O intervalo dessa pessoa será em outro horário.</p></>;
  return <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-3" {...backdrop}>
    <form role="dialog" aria-modal="true" aria-label={tab === "company" ? "Configurar empresa" : "Configurar cobertura mínima"} onSubmit={save} onClick={e => e.stopPropagation()} onKeyDown={e => { if(e.key === "Escape") { e.preventDefault(); e.stopPropagation(); requestClose(); } }} className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg border border-border bg-card shadow-xl">
      <header className="flex items-center justify-between border-b border-border p-4"><h2 className="text-xl font-semibold">{company.name || "Configurar empresa"}<span className="block text-sm font-normal text-muted-foreground">{tab === "company" ? "Configurações da empresa" : "Cobertura mínima"}</span></h2><Button type="button" onClick={requestClose}>Fechar</Button></header>
      <div ref={rulesContainer} className="space-y-4 overflow-auto p-4">

      {tab === "company" ? <>
        <Field label="Nome da empresa"><input autoFocus required value={company.name} onChange={e => patch({name:e.target.value})} /></Field>
        <div className="grid grid-cols-2 gap-3">{time("Abertura",company.opensAt,v => patch({opensAt:v}))}{time("Fechamento",company.closesAt,v => patch({closesAt:v}))}</div>
        {intervalClosure}
        <fieldset><legend>Dias de funcionamento</legend><div className="mt-2 flex flex-wrap gap-2"><Button type="button" aria-pressed={company.operatingDays.length === 7} className={company.operatingDays.length === 7 ? "ring-2 ring-primary ring-offset-2" : "bg-muted text-foreground"} onClick={() => patch({operatingDays:[0,1,2,3,4,5,6]})}>Todos os dias</Button><Button type="button" aria-pressed={company.operatingDays.length === 5 && [1,2,3,4,5].every(d => company.operatingDays.includes(d))} className={company.operatingDays.length === 5 && [1,2,3,4,5].every(d => company.operatingDays.includes(d)) ? "ring-2 ring-primary ring-offset-2" : "bg-muted text-foreground"} onClick={() => patch({operatingDays:[1,2,3,4,5]})}>Dias de semana (seg–sex)</Button></div><div className="mt-2 flex flex-wrap gap-3">{dayLabels.map((d,i) => <label key={d}><input type="checkbox" checked={company.operatingDays.includes(i)} onChange={e => patch({operatingDays:e.target.checked ? [...company.operatingDays,i].sort() : company.operatingDays.filter(v => v !== i)})} /> {d}</label>)}</div></fieldset>
        {time("Descanso mínimo entre turnos",company.minimumRest,v => patch({minimumRest:v}))}
        <Field label="Regime padrão"><select value={company.defaultWorkload.regimeType} onChange={e => workload({regimeType:e.target.value as "dayBased" | "hourBased"})}><option value="dayBased">Ciclo em dias</option><option value="hourBased">Ciclo em horas</option></select></Field>
        <div className="grid grid-cols-2 gap-3"><Field label={company.defaultWorkload.regimeType === "dayBased" ? "Máximo de dias de trabalho no ciclo" : "Máximo de horas por turno"}><input required type="number" min="1" max="168" value={company.defaultWorkload.workUnits} onChange={e => workload({workUnits:e.target.valueAsNumber})} /></Field><Field label={company.defaultWorkload.regimeType === "dayBased" ? "Dias de folga no ciclo" : "Horas de descanso entre turnos"}><input required type="number" min="0" max="168" value={company.defaultWorkload.restUnits} onChange={e => workload({restUnits:e.target.valueAsNumber})} /></Field></div>
        <p className="text-xs text-muted-foreground">{company.defaultWorkload.regimeType === "dayBased" ? `Ciclo ${company.defaultWorkload.workUnits}×${company.defaultWorkload.restUnits}: no máximo ${company.defaultWorkload.workUnits} dias trabalhados a cada ${company.defaultWorkload.workUnits + company.defaultWorkload.restUnits} dias. As folgas são distribuídas pelo gerador conforme a cobertura.` : `Cada turno pode ter até ${company.defaultWorkload.workUnits} horas, com pelo menos ${company.defaultWorkload.restUnits} horas de descanso. Também vale o descanso mínimo da empresa.`} O limite semanal continua valendo.</p><Field label="Limite semanal (horas)"><input required type="number" min="1" max="44" value={company.defaultWorkload.weeklyLimitHours} onChange={e => workload({weeklyLimitHours:e.target.valueAsNumber})} /></Field>
        {time("Horas de trabalho por dia",company.defaultWorkload.defaultShiftDuration,v => workload({defaultShiftDuration:v}))}
        <p className="text-xs text-muted-foreground">A jornada informada é tempo de trabalho. O intervalo é somado ao horário de saída e não conta no limite semanal. Herdar o padrão não obriga cada funcionário a cobrir sozinho todo o expediente.</p><h3 className="font-semibold">Duração do intervalo</h3><p className="text-xs text-muted-foreground">Defina quanto tempo a pausa pode durar. O gerador avalia durações entre o mínimo e o máximo para melhorar a cobertura, somando o intervalo ao horário de saída. “Preferencial após” é o tempo trabalhado desde a entrada até o início da pausa.</p><p className="text-xs text-muted-foreground">CLT, art. 71: acima de 4 até 6h de trabalho, intervalo mínimo de 15min; acima de 6h, mínimo de 1h. O sistema aplica esses mínimos mesmo se a configuração for menor. Reduções por acordo coletivo não são aplicadas automaticamente.</p><div className="grid grid-cols-3 gap-3">{time("Intervalo mínimo",company.lunch.minimum,v => patch({lunch:{...company.lunch,minimum:v}}))}{time("Intervalo máximo",company.lunch.maximum,v => patch({lunch:{...company.lunch,maximum:v}}))}{time("Pausa preferencial após a entrada",company.lunch.preferredAfter,v => patch({lunch:{...company.lunch,preferredAfter:v}}))}</div>
      </> : <>
        {intervalClosure}
        <p className="text-sm text-muted-foreground">Defina quantas pessoas de cada função devem estar trabalhando no período. Selecione todos os dias em que a regra deve valer. O cálculo desconta os intervalos.</p>
        {coverage.length === 0 && <p>Nenhuma regra cadastrada.</p>}
        {coverage.map((rule,i) => {
          const change = (v: Partial<typeof rule>) => setCoverage(rules => rules.map((r,j) => j === i ? {...r,...v} : r));
          return <fieldset data-coverage-rule key={i} className="space-y-3 rounded border border-border p-3"><legend>Regra {i+1}</legend><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rule.allowsOutsideHours ?? false} onChange={e => change({allowsOutsideHours:e.target.checked})} />Autorizar cobertura fora do expediente para esta função (ex.: Segurança Patrimonial)</label><p className="text-xs text-muted-foreground">Empresa: {company.opensAt.slice(0,5)}–{company.closesAt.slice(0,5)} · {company.operatingDays.map(day => dayLabels[day]).join(", ")}. {rule.daysMode === "operating" ? "Dias de funcionamento: acompanha alterações da empresa." : "Dias personalizados."}</p>{rule.days.some(day => outsideOperatingHours(company,day,rule.start,rule.end)) && <p role="alert" className="rounded border border-amber-500 bg-amber-500/10 p-2 text-sm">Fora do expediente — {rule.role || "esta função"}. {rule.allowsOutsideHours ? "Cobertura excepcional autorizada." : "É necessário autorizar explicitamente ou ajustar a regra."}</p>}<div className="grid grid-cols-2 gap-3"><Field label="Função"><select required value={rule.scope === "team" ? "__team" : rule.roleId ?? ""} onChange={e => { if(e.target.value === "__team") {change({scope:"team",roleId:undefined,role:"Equipe (qualquer função)"});return;} const role = document.roles?.find(r => r.id === e.target.value); change({scope:"role",roleId: role?.id, role: role?.name ?? ""}); }}><option value="">Selecione uma função</option><option value="__team">Equipe inteira (qualquer função)</option>{document.roles?.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></Field><fieldset className="col-span-2 space-y-2"><legend className="text-sm font-medium">Dias em que esta regra vale</legend>
            <div className="flex flex-wrap gap-2"><Button type="button" aria-pressed={rule.daysMode !== "operating" && rule.days.length === 7} className={rule.daysMode !== "operating" && rule.days.length === 7 ? "ring-2 ring-primary ring-offset-2" : "bg-muted text-foreground"} onClick={() => change({days:[0,1,2,3,4,5,6],daysMode:"custom"})}>Todos os dias</Button><Button type="button" aria-pressed={rule.daysMode === "operating"} className={rule.daysMode === "operating" ? "ring-2 ring-primary ring-offset-2" : "bg-muted text-foreground"} onClick={() => change({days:[...company.operatingDays],daysMode:"operating"})}>Dias de funcionamento</Button></div>
            <div className="flex flex-wrap gap-2">{dayLabels.map((label,day) => <label key={day} className={"flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm " + (rule.days.includes(day) ? "border-primary bg-primary/10 text-primary" : "border-border bg-background")}><input type="checkbox" checked={rule.days.includes(day)} onChange={e => change({daysMode:"custom",days:e.target.checked ? [...rule.days,day].sort((a,b) => a-b) : rule.days.filter(d => d !== day)})} />{label}</label>)}</div>
            <p className="text-xs text-muted-foreground">{rule.daysMode === "operating" ? "Selecionado: dias de funcionamento (acompanha a empresa)." : rule.days.length === 7 ? "Selecionado: todos os dias." : "Selecionado: dias personalizados."} O mesmo horário e quantidade valem nos dias selecionados.</p>
          </fieldset>{time("Início",rule.start,v => change({start:v}))}{time("Fim",rule.end,v => change({end:v}))}<Field label="Quantidade mínima"><input required type="number" min="0" max="200" value={rule.minimumEmployees} onChange={e => change({minimumEmployees:e.target.valueAsNumber})} /></Field></div><Button type="button" disabled={!document.roles?.length} onClick={() => setCoverage(rules => rules.filter((_,j) => j !== i))}>Remover regra</Button></fieldset>;
        })}
        <datalist id="coverage-roles">{Array.from(new Set(document.employees.map(e => e.role))).map(role => <option key={role} value={role} />)}</datalist>
        <Button type="button" onClick={() => { revealNewRule.current = true; setCoverage(rules => [...rules,{role:"",daysMode:"operating",allowsOutsideHours:false,days:[...company.operatingDays],start:company.opensAt,end:company.closesAt,minimumEmployees:1}]); }}>Adicionar regra de cobertura</Button>
      </>}
      {error && <p role="alert" className="text-red-400">{error}</p>}
      </div><footer className="flex gap-2 border-t border-border p-4"><Button type="submit">Salvar alterações</Button><Button type="button" onClick={requestClose}>Cancelar</Button></footer>
    </form>
  </div>;
}
function Field({label,children}: {label:string;children:ReactNode}) {
  return <label className="block space-y-1 text-sm"><span>{label}</span><div className="[&>input]:w-full [&>input]:rounded [&>input]:border [&>input]:border-border [&>input]:bg-background [&>input]:p-2 [&>select]:w-full [&>select]:rounded [&>select]:bg-background [&>select]:p-2">{children}</div></label>;
}

