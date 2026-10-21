import { AlertTriangle, ArrowRight, Check, Clock3, ShieldCheck, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import { RolesEditor } from "./RolesEditor";
import { CompanyEditor } from "./CompanyEditor";
import { outsideOperatingHours } from "../lib/coverageRules";
import { dayLabels, regimeLabel } from "../lib/planning";
import { useScheduleStore } from "../store/scheduleStore";
import { Badge, Button, Panel } from "./ui";

export function OperationalSidebar() {
  const { document, analysis, selectedEmployeeId, setSelectedEmployeeId } = useScheduleStore();

  const [section, setSection] = useState<"company" | "roles" | "coverage" | "team">("company");
  const [search, setSearch] = useState("");
  const [editor,setEditor] = useState<"company" | "coverage" | null>(null);
  const steps = [
    { id: "company", label: "Empresa", done: document.setup?.companyConfigured ?? (document.employees.length > 0 || document.company.coverage.length > 0), description: "Defina os dias e horários de funcionamento." },
    { id: "roles", label: "Funções", done: Boolean(document.roles?.length), description: "Cadastre os cargos usados na cobertura e na equipe." },
    { id: "coverage", label: "Cobertura", done: document.company.coverage.length > 0, description: "Informe quantas pessoas precisa por função e horário." },
    { id: "team", label: "Equipe", done: document.employees.length > 0, description: "Adicione as pessoas e suas jornadas de trabalho." },
  ] as const;
  const completed = steps.filter(step => step.done).length;
  const currentIndex = steps.findIndex(step => step.id === section);
  const nextPending = steps.find(step => !step.done);
  const currentStep = steps[currentIndex];
  return (
    <Panel className="flex h-full min-h-0 w-full flex-col border-r">
      <div className="setup-heading">
        <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">Configure sua escala</h2><span className="text-xs text-primary" role="status">{completed}/4 concluídas</span></div>
        {nextPending && <p className="text-xs text-muted-foreground">Preencha as etapas em ordem para gerar.</p>}
        <progress className="setup-progress" value={completed} max={4} aria-label="Etapas de cadastro concluídas" />
      </div>
      <nav aria-label="Etapas de configuração" className="setup-steps">
        <ol>
          {steps.map((step, index) => <li key={step.id}>
            <button className={"setup-step " + (section === step.id ? "is-current" : "")} aria-current={section === step.id ? "step" : undefined} aria-label={`${index + 1}. ${step.label}: ${step.done ? "Concluída" : nextPending?.id === step.id ? "Próximo passo" : "Pendente"}`} title={step.description} onClick={() => setSection(step.id)}>
              <span className={"setup-step-number " + (step.done ? "is-done" : "")}>{index + 1}</span>
              <span className="setup-step-label">{step.label}</span>
              {step.done && <Check className="size-3 text-primary" aria-hidden="true" />}
            </button>
          </li>)}
          <li><button className="setup-step setup-generate" onClick={() => {if(nextPending) setSection(nextPending.id);else useScheduleStore.getState().setViewMode("solver");}}><span className="setup-step-number">5</span><span className="setup-step-label">Revisar e gerar</span><ArrowRight className="size-4" /></button></li>
        </ol>
      </nav>
      <div className="setup-content min-h-0 flex-1 space-y-4 overflow-auto p-3">
        <div className="setup-current-description"><h3 className="text-sm font-semibold">Etapa {currentIndex + 1} · {currentStep.label}</h3><p className="text-xs text-muted-foreground">{currentStep.description}</p></div>

        {section === "roles" && <RolesEditor />}
        {section === "company" && <section className="space-y-2">
          <SectionTitle icon={<Clock3 className="size-4" />} title={document.company.name} /><Button className="w-full" onClick={() => setEditor("company")}>Configurar empresa</Button>
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Funcionamento" value={`${document.company.opensAt.slice(0, 5)}-${document.company.closesAt.slice(0, 5)}`} />
            <Metric label="Descanso CLT" value={document.company.minimumRest.slice(0, 5)} />
            <Metric label="Jornada padrão" value={document.company.defaultWorkload.defaultShiftDuration.slice(0, 5)} />
            <Metric label="Intervalo" value={`${document.company.lunch.minimum.slice(0, 5)}-${document.company.lunch.maximum.slice(0, 5)}`} />
          </div>
          <div className="rounded-md border border-border bg-background p-3">
            <p className="text-xs text-muted-foreground">Dias ativos</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {document.company.operatingDays.map((day) => <Badge key={day}>{dayLabels[day]}</Badge>)}
            </div>
          </div>
        </section>}

        {section === "coverage" && <section className="space-y-2">
          <SectionTitle icon={<ShieldCheck className="size-4" />} title="Cobertura mínima" /><Button className="w-full" disabled={!document.roles?.length} onClick={() => setEditor("coverage")}>Editar cobertura mínima</Button>
          {!document.roles?.length && <p className="text-sm text-muted-foreground">Primeiro, complete a etapa 2: Funções.</p>}
          {!document.company.coverage.length && <p className="text-sm text-muted-foreground">Nenhuma cobertura definida. Informe quantas pessoas são necessárias por função e horário.</p>}
          {document.company.coverage.map((requirement,index) => {
            const blocks = analysis.coverage.filter(b => b.role === requirement.role && new Date(b.start).getDay() === requirement.day && (() => {
              const minute = (v: string) => { const [h,m] = v.split(":").map(Number); return h*60+m; };
              const start = minute(requirement.start), end = minute(requirement.end), date = new Date(b.start), at = date.getHours()*60+date.getMinutes();
              return end > start ? at >= start && at < end : at >= start || at < end;
            })());
            const covered = blocks.length ? Math.min(...blocks.map(b => b.assigned)) : 0;
            const coverage = { covered, missing: Math.max(0,requirement.minimumEmployees-covered), ratio: requirement.minimumEmployees ? covered/requirement.minimumEmployees : 1 };
            const state = coverage.missing > 0 ? "text-red-400" : coverage.ratio < 1.25 ? "text-amber-400" : "text-emerald-400";
            return (
              <article key={index} className="rounded-md border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium capitalize">{requirement.role}</p>{outsideOperatingHours(document.company,requirement.day,requirement.start,requirement.end) && <p className="text-xs font-semibold text-amber-600">Fora do expediente · {requirement.allowsOutsideHours ? "Autorizado" : "Revisar autorização"}</p>}
                    <p className="text-xs text-muted-foreground">{dayLabels[requirement.day]} {requirement.start.slice(0, 5)}-{requirement.end.slice(0, 5)}</p>
                  </div>
                  <span className={`text-sm font-semibold ${state}`}>{coverage.covered}/{requirement.minimumEmployees}</span>
                </div>
                <div className="mt-3 h-1.5 rounded bg-muted">
                  <div className={`h-1.5 rounded ${coverage.missing > 0 ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, coverage.ratio * 100)}%` }} />
                </div>
              </article>
            );
          })}
        </section>}

        {section === "team" && <section className="space-y-2">
          <SectionTitle icon={<Users className="size-4" />} title="Equipe" /><Button className="w-full" disabled={!document.roles?.length} onClick={() => setSelectedEmployeeId("new")}>Adicionar funcionário</Button>
          {!document.roles?.length && <p className="text-sm text-muted-foreground">Primeiro, cadastre as funções na aba Funções.</p>}
          <label className="block text-xs text-muted-foreground">Buscar na equipe<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome ou função" className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" /></label>
          <p className="py-1 text-xs text-muted-foreground">{document.employees.length} pessoas cadastradas · Clique para editar</p>
          {document.employees.filter(employee => (employee.name + ' ' + employee.role).toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))).map((employee) => {
            const gaps = analysis.gaps.filter((gap) => gap.role === employee.role).length;
            const active = selectedEmployeeId === employee.id;
            return (
              <button
                key={employee.id}
                className={`w-full rounded-md border p-3 text-left transition ${active ? "border-primary bg-muted" : "border-border bg-background hover:border-primary/60"}`}
                onClick={() => setSelectedEmployeeId(employee.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{employee.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{employee.role}</p>
                  </div>
                  {gaps > 0 && (
                    <span className="text-amber-400" title="Alertas de cobertura">
                      <AlertTriangle className="size-3.5" />
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  <Badge>{regimeLabel(employee)}</Badge>
                  <Badge>{employee.workload.weeklyLimitHours}h</Badge>
                  {employee.restrictions.length > 0 && <Badge>{employee.restrictions.length} restr.</Badge>}
                  {employee.allowsOvertime && <Badge>extra</Badge>}
                  {employee.allowsNightWork && <Badge>noturno</Badge>}
                </div>
              </button>
            );
          })}
          {search && !document.employees.some(employee => (employee.name + " " + employee.role).toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))) && <p className="text-sm text-muted-foreground">Nenhuma pessoa encontrada.</p>}
        </section>}
      </div>
        <div className="setup-continue shrink-0 p-3">
          <Button className="w-full" disabled={!currentStep.done} onClick={() => {const next=steps[currentIndex+1];if(next) setSection(next.id);else if(nextPending) setSection(nextPending.id);else useScheduleStore.getState().setViewMode("solver");}}>{currentIndex < 3 ? "Continuar para " + steps[currentIndex+1].label : nextPending ? "Completar " + nextPending.label : "Revisar e gerar escala"}<ArrowRight className="size-4" /></Button>
          {!currentStep.done && <p className="mt-2 text-xs text-muted-foreground">Salve este cadastro para continuar.</p>}
        </div>
      {editor && <CompanyEditor tab={editor} onClose={() => setEditor(null)} onSaved={() => { if (editor === "company") setSection("roles"); }} />}
    </Panel>
  );
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {icon}
      <span>{title}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
