import { AlertTriangle, Building2, Clock3, ShieldCheck, Users } from "lucide-react";
import type { ReactNode } from "react";
import { coverageForRequirement, dayLabels, regimeLabel } from "../lib/planning";
import { useScheduleStore } from "../store/scheduleStore";
import { Badge, IconButton, Panel } from "./ui";

export function OperationalSidebar() {
  const { document, analysis, selectedEmployeeId, setSelectedEmployeeId } = useScheduleStore();

  return (
    <Panel className="flex h-full min-h-0 w-full flex-col border-r">
      <div className="border-b border-border p-4">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wide">Operacao</h2>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
        <section className="space-y-2">
          <SectionTitle icon={<Clock3 className="size-4" />} title="Empresa" />
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Funcionamento" value={`${document.company.opensAt.slice(0, 5)}-${document.company.closesAt.slice(0, 5)}`} />
            <Metric label="Descanso CLT" value={document.company.minimumRest.slice(0, 5)} />
            <Metric label="Jornada padrao" value={document.company.defaultWorkload.defaultShiftDuration.slice(0, 5)} />
            <Metric label="Almoco" value={`${document.company.lunch.minimum.slice(0, 5)}-${document.company.lunch.maximum.slice(0, 5)}`} />
          </div>
          <div className="rounded-md border border-border bg-background p-3">
            <p className="text-xs text-muted-foreground">Dias ativos</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {document.company.operatingDays.map((day) => <Badge key={day}>{dayLabels[day]}</Badge>)}
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <SectionTitle icon={<ShieldCheck className="size-4" />} title="Cobertura minima" />
          {document.company.coverage.map((requirement) => {
            const coverage = coverageForRequirement(document, requirement);
            const state = coverage.missing > 0 ? "text-red-400" : coverage.ratio < 1.25 ? "text-amber-400" : "text-emerald-400";
            return (
              <article key={`${requirement.role}-${requirement.day}-${requirement.start}`} className="rounded-md border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium capitalize">{requirement.role}</p>
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
        </section>

        <section className="space-y-2">
          <SectionTitle icon={<Users className="size-4" />} title="Funcionarios" />
          {document.employees.map((employee) => {
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
                    <IconButton className="size-7 border-amber-500/40 text-amber-400" title="Alertas de cobertura">
                      <AlertTriangle className="size-3.5" />
                    </IconButton>
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
        </section>
      </div>
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
