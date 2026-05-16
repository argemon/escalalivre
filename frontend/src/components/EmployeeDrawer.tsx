import { CalendarDays, Clock, PanelRightClose, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { dayLabels, regimeLabel } from "../lib/planning";
import { useScheduleStore } from "../store/scheduleStore";
import { Badge, IconButton } from "./ui";

export function EmployeeDrawer() {
  const { document, selectedEmployeeId, setSelectedEmployeeId } = useScheduleStore();
  const employee = document.employees.find((item) => item.id === selectedEmployeeId);

  if (!employee) {
    return null;
  }

  return (
    <aside className="absolute inset-y-0 right-0 z-30 w-full max-w-md border-l border-border bg-card shadow-2xl">
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex items-start justify-between border-b border-border p-5">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Editor avancado</p>
            <h2 className="text-xl font-semibold">{employee.name}</h2>
            <p className="text-sm capitalize text-muted-foreground">{employee.role}</p>
          </div>
          <IconButton title="Fechar" onClick={() => setSelectedEmployeeId(undefined)}>
            <PanelRightClose className="size-4" />
          </IconButton>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-5">
          <Section title="Regime" icon={<SlidersHorizontal className="size-4" />}>
            <div className="rounded-md border border-border bg-background p-3">
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Herdar padrao empresa</span>
                <input type="checkbox" checked={employee.inheritsCompanyDefaults} readOnly className="size-4 accent-emerald-500" />
              </label>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Badge className={employee.workload.regimeType === "dayBased" ? "border-emerald-500 text-emerald-400" : ""}>DAY_BASED</Badge>
                <Badge className={employee.workload.regimeType === "hourBased" ? "border-emerald-500 text-emerald-400" : ""}>HOUR_BASED</Badge>
              </div>
              <p className="mt-3 text-sm font-medium">{regimeLabel(employee)}</p>
            </div>
          </Section>

          <Section title="Jornada" icon={<Clock className="size-4" />}>
            <div className="grid grid-cols-2 gap-2">
              <Metric label="Semanal maxima" value={`${employee.workload.weeklyLimitHours}h`} />
              <Metric label="Turno padrao" value={employee.workload.defaultShiftDuration.slice(0, 5)} />
              <Metric label="Hora extra" value={employee.allowsOvertime ? "permitida" : "bloqueada"} />
              <Metric label="Noturno" value={employee.allowsNightWork ? "permitido" : "bloqueado"} />
            </div>
          </Section>

          <Section title="Disponibilidade" icon={<CalendarDays className="size-4" />}>
            <WeeklyGrid activeDays={document.company.operatingDays} />
          </Section>

          <Section title="Restricoes">
            <div className="space-y-2">
              <Rule text={employee.allowsNightWork ? "Pode fazer noturno" : "Nao faz noturno"} />
              <Rule text={employee.preferredDaysOff.length > 0 ? `Folga preferida: ${employee.preferredDaysOff.map((day) => dayLabels[day]).join(", ")}` : "Sem folga preferida"} />
              <Rule text={employee.restrictions.length > 0 ? `${employee.restrictions.length} bloqueio(s) de horario` : "Sem bloqueios cadastrados"} />
            </div>
          </Section>

          <Section title="Preferencias">
            <div className="space-y-2">
              {employee.preferences.length === 0 && <Rule text="Sem preferencias cadastradas" />}
              {employee.preferences.map((preference) => <Rule key={preference.code} text={`${preference.description} · peso ${preference.weight}`} />)}
            </div>
          </Section>

          <Section title="Almoco flexivel">
            <div className="rounded-md border border-border bg-background p-3">
              <div className="grid grid-cols-3 gap-2">
                <Metric label="Minimo" value={document.company.lunch.minimum.slice(0, 5)} />
                <Metric label="Maximo" value={document.company.lunch.maximum.slice(0, 5)} />
                <Metric label="Apos" value={document.company.lunch.preferredAfter.slice(0, 5)} />
              </div>
              <div className="mt-3 h-8 rounded bg-muted p-1">
                <div className="h-6 w-1/2 rounded bg-amber-500/80 text-center text-xs font-medium leading-6 text-slate-950">janela movel</div>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </aside>
  );
}

function Section({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function Rule({ text }: { text: string }) {
  return <p className="rounded-md border border-border bg-background px-3 py-2 text-sm">{text}</p>;
}

function WeeklyGrid({ activeDays }: { activeDays: number[] }) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {dayLabels.map((day, index) => (
        <div key={day} className={`rounded-md border p-2 text-center text-xs ${activeDays.includes(index) ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-border bg-background text-muted-foreground"}`}>
          <p className="font-medium">{day}</p>
          <p className="mt-1">08-22</p>
        </div>
      ))}
    </div>
  );
}
