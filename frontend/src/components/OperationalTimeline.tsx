import { Activity, Flame, Layers3 } from "lucide-react";
import { Fragment, useState } from "react";
import {
  assignmentForEmployee,
  assignmentLabel,
  dateToTimelineHour,
  durationPercent,
  formatHour,
  percentAt,
  timelineHours
} from "../lib/planning";
import { useScheduleStore } from "../store/scheduleStore";
import type { CoverageBlock } from "../types/schedule";
import { Badge } from "./ui";

const dayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

export function OperationalTimeline() {
  const { viewMode, setSelectedEmployeeId } = useScheduleStore();
  const coverage = useScheduleStore((state) => state.analysis.coverage);

  return (
    <main className="min-w-0 flex-1 overflow-hidden bg-background">
      <div className="flex h-full min-h-0 flex-col">
        <section className="border-b border-border bg-card px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Planejamento diário</p>
              <h2 className="text-xl font-semibold">Sua escala, de um jeito simples</h2>
            </div>
            <div className="flex gap-2">
              <Badge><Layers3 className="mr-1 size-3" /> Turnos reais</Badge>
              <Badge><Activity className="mr-1 size-3" /> Sobreposição</Badge>
              <Badge><Flame className="mr-1 size-3" /> Turnos noturnos</Badge>
            </div>
          </div>
        </section>

        <section className="border-b border-border px-5 py-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Linha de cobertura</p>
            <p className="text-xs text-muted-foreground">Verde: coberto · Amarelo: atenção · Vermelho: faltam pessoas</p>
          </div>
          <div className="grid h-10 grid-cols-12 overflow-hidden rounded-md border border-border">
            {coverage.slice(0, 12).map((block) => (
              <CoverageSegment key={`${block.role}-${block.start}`} block={block} />
            ))}
          </div>
        </section>

        <section className="min-h-0 flex-1 overflow-auto p-5">
          {viewMode === "coverage" ? <CoverageTable /> : viewMode === "heatmap" ? <Heatmap /> : <TimelineRows onEmployeeClick={setSelectedEmployeeId} />}
        </section>
      </div>
    </main>
  );
}

function TimelineRows({ onEmployeeClick }: { onEmployeeClick: (id: string) => void }) {
  const document = useScheduleStore((state) => state.document);
  const dates = Array.from(new Set(document.assignments.map(a => a.start.slice(0,10)))).sort();
  const [selectedDate, setSelectedDate] = useState(dates[0] ?? "");
  const activeDate = dates.includes(selectedDate) ? selectedDate : dates[0] ?? "";

  return (
    <div className="min-w-[960px] rounded-md border border-border bg-card">
      <label className="flex items-center gap-3 border-b border-border p-3 text-sm">Dia do planejamento<select className="rounded border border-border bg-background p-2" value={activeDate} onChange={e => setSelectedDate(e.target.value)}>{dates.map(date => <option key={date} value={date}>{date.split("-").reverse().join("/")}</option>)}</select>{dates.length === 0 && <span>Sem turnos cadastrados</span>}</label>
      <div className="sticky top-0 z-10 grid grid-cols-[180px_1fr] border-b border-border bg-card">
        <div className="border-r border-border px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">Pessoa</div>
        <div className="relative h-10">
          {timelineHours.map((hour) => (
            <div key={hour} className="absolute top-0 h-full border-l border-border/70 px-1 pt-2 text-[11px] text-muted-foreground" style={{ left: `${percentAt(hour)}%` }}>
              {formatHour(hour)}
            </div>
          ))}
        </div>
      </div>

      {document.employees.map((employee) => {
        const assignments = assignmentForEmployee(document, employee.id).filter(a => a.start.slice(0,10) === activeDate);
        return (
          <div key={employee.id} className="grid min-h-20 grid-cols-[180px_1fr] border-b border-border last:border-b-0">
            <button className="border-r border-border px-3 py-3 text-left hover:bg-muted" onClick={() => onEmployeeClick(employee.id)}>
              <p className="text-sm font-medium">{employee.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{employee.role}</p>
            </button>
            <div className="relative min-h-20 bg-[linear-gradient(90deg,hsl(var(--border))_1px,transparent_1px)] bg-[length:4.166%_100%]">
              {assignments.map((assignment) => {
                const start = dateToTimelineHour(assignment.start);
                const end = dateToTimelineHour(assignment.end, assignment.start.slice(0, 10));
                const lunchStart = assignment.break ? dateToTimelineHour(assignment.break.start, assignment.start.slice(0, 10)) : undefined;
                const lunchEnd = assignment.break ? dateToTimelineHour(assignment.break.end, assignment.start.slice(0, 10)) : undefined;
                const overnight = new Date(assignment.end).getDate() !== new Date(assignment.start).getDate();
                return (
                  <div
                    key={assignment.id}
                    className={`absolute top-4 h-11 rounded-md border px-2 py-1 shadow-sm ${overnight ? "border-sky-400/60 bg-sky-500/25" : assignment.source === "solver" ? "border-emerald-400/60 bg-emerald-500/25" : "border-violet-400/60 bg-violet-500/25"}`}
                    style={{ left: `${percentAt(start)}%`, width: `${durationPercent(start, end)}%` }}
                    title={assignmentLabel(assignment)}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                      <span>{assignmentLabel(assignment)}</span>
                      {overnight && <span>+1d</span>}
                    </div>
                    {lunchStart !== undefined && lunchEnd !== undefined && (
                      <div
                        className="absolute bottom-1 top-1 rounded bg-amber-400/80 text-center text-[10px] font-semibold leading-8 text-slate-950"
                        style={{
                          left: `${Math.max(0, 100 * (lunchStart - start) / (end - start))}%`,
                          width: `${100 * (lunchEnd - lunchStart) / (end - start)}%`
                        }}
                      >
                        almoço
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Heatmap() {
  const coverage = useScheduleStore((state) => state.analysis.coverage);
  const roles = Array.from(new Set(coverage.map((block) => block.role)));
  const days = Array.from(new Set(coverage.map((block) => new Date(block.start).getDay()))).sort((a, b) => a - b);

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase text-muted-foreground">Onde faltam pessoas</p>
          <h3 className="text-lg font-semibold">Necessidade de pessoas por função e dia</h3>
        </div>
        <Badge>tempo real</Badge>
      </div>
      {coverage.length === 0 && <p className="text-sm text-muted-foreground">Otimize a operação para calcular a cobertura e identificar lacunas.</p>}
      <div className="grid gap-2" style={{ gridTemplateColumns: `120px repeat(${Math.max(days.length, 1)}, minmax(72px, 1fr))` }}>
        <div />
        {days.map((day) => <p key={day} className="text-center text-xs text-muted-foreground">{dayLabels[day]}</p>)}
        {roles.map((role) => (
          <Fragment key={role}>
            <p key={`${role}-label`} className="py-3 text-sm font-medium capitalize">{role}</p>
            {days.map((day) => {
              const blocks = coverage.filter((block) => block.role === role && new Date(block.start).getDay() === day);
              const uncovered = blocks.filter((block) => block.state === "uncovered").length;
              const warning = blocks.filter((block) => block.state === "warning").length;
              const color = uncovered > 0 ? "coverage-uncovered" : warning > 0 ? "coverage-warning" : "coverage-healthy";
              const label = blocks.length === 0 ? "sem regra" : `${blocks.reduce((sum, block) => sum + block.assigned, 0)}/${blocks.reduce((sum, block) => sum + block.required, 0)}`;
              return <div key={`${role}-${day}`} className={`flex h-12 items-center justify-center rounded-md text-xs font-semibold ${color}`}>{label}</div>;
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function CoverageSegment({ block }: { block: CoverageBlock }) {
  const className =
    block.state === "healthy"
      ? "coverage-healthy"
      : block.state === "warning"
        ? "coverage-warning"
        : "coverage-uncovered";

  return (
    <div title={`${block.role}: ${block.assigned} pessoas escaladas de ${block.required} necessárias. ${block.state === "healthy" ? "Coberto" : block.state === "warning" ? "Atenção" : "Faltam pessoas"}`}
      className={`flex min-w-0 items-center justify-center border-r border-background/40 px-1 text-xs font-semibold last:border-r-0 ${className}`}>
      {new Date(block.start).getHours()}h {block.assigned}/{block.required}
    </div>
  );
}

function CoverageTable() {
  const coverage = useScheduleStore(state => state.analysis.coverage);
  return <section className="rounded border border-border bg-card p-4"><h3 className="mb-3 text-lg font-semibold">Cobertura por período e função</h3>{coverage.length === 0 ? <p>Otimize a operação para calcular a cobertura.</p> : <table className="w-full text-left text-sm"><thead><tr><th>Função</th><th>Início</th><th>Fim</th><th>Alocados / necessários</th></tr></thead><tbody>{coverage.map((block,i) => <tr key={i} className="border-t border-border"><td className="py-2">{block.role}</td><td>{new Date(block.start).toLocaleString("pt-BR")}</td><td>{new Date(block.end).toLocaleString("pt-BR")}</td><td className={block.assigned >= block.required ? "text-emerald-400" : "text-red-400"}>{block.assigned} / {block.required}</td></tr>)}</tbody></table>}</section>;
}
