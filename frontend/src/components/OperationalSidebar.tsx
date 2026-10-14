import { AlertTriangle, Building2, Clock3, ShieldCheck, Users } from "lucide-react";
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
  return (
    <Panel className="flex h-full min-h-0 w-full flex-col border-r">
      <div className="border-b border-border p-4">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-primary" />
          <h2 className="break-words text-lg font-semibold">{document.company.name}</h2>
        </div>
      </div>

      <div className="space-y-2 border-b border-border p-3">
        <p className="text-sm font-semibold">Configure seu planejamento</p>
        <ol className="space-y-1 text-xs">
          {([
            ['company', 'Empresa', document.setup?.companyConfigured ?? (document.employees.length > 0 || document.company.coverage.length > 0), 'Definir funcionamento'],
            ['roles', 'Funções', Boolean(document.roles?.length), 'Cadastrar funções'],
            ['coverage', 'Cobertura', document.company.coverage.length > 0, 'Definir cobertura'],
            ['team', 'Equipe', document.employees.length > 0, 'Adicionar funcionários'],
          ] as const).map(([id, label, done, pending], index) => <li key={id}><button className="flex w-full items-center justify-between gap-2 rounded p-1 text-left hover:bg-muted" onClick={() => setSection(id)}><span>{index + 1}. {label}</span><span className={done ? 'text-emerald-600' : 'text-muted-foreground'}>{done ? 'Cadastrado' : pending}</span></button></li>)}
        </ol>
        <button className="text-xs font-medium text-primary" onClick={() => useScheduleStore.getState().setViewMode("solver")}>5. Revisar e gerar escala →</button>
      </div>
      <nav aria-label="Dados do planejamento" className="flex gap-1 border-b border-border p-2">
        {([['company', 'Empresa'], ['roles', 'Funções'], ['coverage', 'Cobertura'], ['team', 'Equipe']] as const).map(([id, label]) => <button key={id} aria-pressed={section === id} onClick={() => setSection(id)} className={"flex-1 rounded-lg px-2 py-2 text-sm font-medium transition " + (section === id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>{label}</button>)}
      </nav>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
        {section === "roles" && <RolesEditor />}
        {section === "company" && <section className="space-y-2">
          <SectionTitle icon={<Clock3 className="size-4" />} title={document.company.name} /><Button className="w-full" onClick={() => setEditor("company")}>Configurar empresa</Button>
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Funcionamento" value={`${document.company.opensAt.slice(0, 5)}-${document.company.closesAt.slice(0, 5)}`} />
            <Metric label="Descanso CLT" value={document.company.minimumRest.slice(0, 5)} />
            <Metric label="Jornada padrão" value={document.company.defaultWorkload.defaultShiftDuration.slice(0, 5)} />
            <Metric label="Almoço" value={`${document.company.lunch.minimum.slice(0, 5)}-${document.company.lunch.maximum.slice(0, 5)}`} />
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
          {!document.roles?.length && <p className="text-sm text-muted-foreground">Primeiro, cadastre as funções na aba Funções.</p>}
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
