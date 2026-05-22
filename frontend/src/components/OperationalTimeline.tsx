import { Activity, Flame, Layers3 } from "lucide-react";
import { Fragment } from "react";
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
              <p className="text-xs uppercase text-muted-foreground">Timeline operacional</p>
              <h2 className="text-xl font-semibold">Cobertura em tempo real - Seg 18/05</h2>
            </div>
            <div className="flex gap-2">
              <Badge><Layers3 className="mr-1 size-3" /> Turnos reais</Badge>
              <Badge><Activity className="mr-1 size-3" /> Sobreposicao</Badge>
              <Badge><Flame className="mr-1 size-3" /> Overnight</Badge>
            </div>
          </div>
        </section>

        <section className="border-b border-border px-5 py-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Linha de cobertura</p>
            <p className="text-xs text-muted-foreground">verde OK - amarelo atencao - vermelho buraco</p>
          </div>
          <div className="grid h-10 grid-cols-12 overflow-hidden rounded-md border border-border">
            {coverage.slice(0, 12).map((block) => (
              <CoverageSegment key={`${block.role}-${block.start}`} block={block} />
            ))}
          </div>
        </section>

        <section className="min-h-0 flex-1 overflow-auto p-5">
          {viewMode === "heatmap" ? <Heatmap /> : <TimelineRows onEmployeeClick={setSelectedEmployeeId} />}
        </section>
      </div>
    </main>
  );
}

function TimelineRows({ onEmployeeClick }: { onEmployeeClick: (id: string) => void }) {
  const document = useScheduleStore((state) => state.document);

  return (
    <div className="min-w-[960px] rounded-md border border-border bg-card">
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
        const assignments = assignmentForEmployee(document, employee.id);
        return (
          <div key={employee.id} className="grid min-h-20 grid-cols-[180px_1fr] border-b border-border last:border-b-0">
            <button className="border-r border-border px-3 py-3 text-left hover:bg-muted" onClick={() => onEmployeeClick(employee.id)}>
              <p className="text-sm font-medium">{employee.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{employee.role}</p>
            </button>
            <div className="relative min-h-20 bg-[linear-gradient(90deg,hsl(var(--border))_1px,transparent_1px)] bg-[length:4.166%_100%]">
              {assignments.map((assignment) => {
                const start = dateToTimelineHour(assignment.start);
                const end = dateToTimelineHour(assignment.end);
                const lunchStart = assignment.break ? dateToTimelineHour(assignment.break.start) : undefined;
                const lunchEnd = assignment.break ? dateToTimelineHour(assignment.break.end) : undefined;
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
                          left: `${Math.max(0, percentAt(lunchStart) - percentAt(start))}%`,
                          width: `${Math.max(8, percentAt(lunchEnd) - percentAt(lunchStart))}%`
                        }}
                      >
                        almoco
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
          <p className="text-xs uppercase text-muted-foreground">Heatmap operacional</p>
          <h3 className="text-lg font-semibold">Risco por funcao e dia</h3>
        </div>
        <Badge>tempo real</Badge>
      </div>
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
              const color = uncovered > 0 ? "bg-red-500/70" : warning > 0 ? "bg-amber-500/70" : "bg-emerald-500/70";
              const label = blocks.length === 0 ? "sem regra" : `${blocks.reduce((sum, block) => sum + block.assigned, 0)}/${blocks.reduce((sum, block) => sum + block.required, 0)}`;
              return <div key={`${role}-${day}`} className={`flex h-12 items-center justify-center rounded-md text-xs font-semibold text-slate-950 ${color}`}>{label}</div>;
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
      ? "bg-emerald-500/25 text-emerald-300"
      : block.state === "warning"
        ? "bg-amber-500/25 text-amber-300"
        : "bg-red-500/25 text-red-300";

  return (
    <div className={`flex min-w-0 items-center justify-center border-r border-background/40 px-1 text-[11px] font-semibold last:border-r-0 ${className}`}>
      {new Date(block.start).getHours()}h {block.assigned}/{block.required}
    </div>
  );
}
