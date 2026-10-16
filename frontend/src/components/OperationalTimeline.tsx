import { outsideOperatingHours } from "../lib/coverageRules";
import { Activity, Flame, Layers3 } from "lucide-react";
import { Fragment, useState } from "react";
import {
  assignmentForEmployee,
  assignmentLabel,
  dateToTimelineHour,
  formatHour,
} from "../lib/planning";
import { useScheduleStore } from "../store/scheduleStore";
import type { CoverageBlock } from "../types/schedule";
import { Badge } from "./ui";

const dayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

export function OperationalTimeline() {
  const { viewMode, setSelectedEmployeeId } = useScheduleStore();
  const document=useScheduleStore(state=>state.document);
  const dates=[...new Set(document.assignments.map(a=>a.start.slice(0,10)))].sort();
  const [selectedDate,setSelectedDate]=useState(dates[0] ?? "");
  const activeDate=dates.includes(selectedDate) ? selectedDate : dates[0] ?? "";

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

        <section className="min-h-0 flex-1 overflow-auto p-5">
          {viewMode === "coverage" ? <CoverageTable /> : viewMode === "heatmap" ? <Heatmap /> : <TimelineRows onEmployeeClick={setSelectedEmployeeId} selectedDate={activeDate} setSelectedDate={setSelectedDate} />}
        </section>
      </div>
    </main>
  );
}

function TimelineRows({ onEmployeeClick,selectedDate,setSelectedDate }: { onEmployeeClick: (id: string) => void;selectedDate:string;setSelectedDate:(date:string)=>void }) {
  const document = useScheduleStore((state) => state.document);
  const dates = Array.from(new Set(document.assignments.map(a => a.start.slice(0,10)))).sort();

  const activeDate = dates.includes(selectedDate) ? selectedDate : dates[0] ?? "";
  const hours = (v: string) => { const [h,m] = v.split(":").map(Number); return h+m/60; };
  const opening = hours(document.company.opensAt), closing = hours(document.company.closesAt)+(hours(document.company.closesAt)<=opening ? 24 : 0);
  const shifts = document.assignments.filter(a => a.start.slice(0,10) === activeDate);
  const startHour = Math.floor(Math.min(opening,...shifts.map(a => dateToTimelineHour(a.start,activeDate))));
  const endHour = Math.ceil(Math.max(closing,...shifts.map(a => dateToTimelineHour(a.end,activeDate))));
  const span = Math.max(1,endHour-startHour);
  const timelineHours = Array.from({length:span},(_,i) => startHour+i);
  const percentAt = (hour: number) => Math.min(100,Math.max(0,(hour-startHour)/span*100));
  const durationPercent = (from: number,to: number) => Math.max(1,percentAt(to)-percentAt(from));

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
                    title={assignmentLabel(assignment) + (outsideOperatingHours(document.company,new Date(assignment.start).getDay(),assignment.start.slice(11,19),assignment.end.slice(11,19)) ? " · Fora do expediente" : "")}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                      <span>{assignmentLabel(assignment)}{outsideOperatingHours(document.company,new Date(assignment.start).getDay(),assignment.start.slice(11,19),assignment.end.slice(11,19)) && " · Fora do expediente"}</span>
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
                        intervalo
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

function CoverageTable() {
  const coverage = useScheduleStore(state => state.analysis.coverage);
  const dates = [...new Set(coverage.map(b => b.start.slice(0,10)))].sort();
  const [date,setDate] = useState("");
  const [role,setRole] = useState("");
  const activeDate = dates.includes(date) ? date : dates[0] ?? "";
  const roles = [...new Set(coverage.map(b => b.role))].sort();
  const rows: CoverageBlock[] = [];
  for (const block of coverage.filter(b => b.start.slice(0,10) === activeDate && (!role || b.role === role)).sort((a,b) => a.role.localeCompare(b.role) || a.start.localeCompare(b.start))) {
    const previous = rows[rows.length-1];
    if (previous && previous.role === block.role && previous.end === block.start && previous.required === block.required && previous.assigned === block.assigned && previous.state === block.state) previous.end = block.end;
    else rows.push({...block});
  }
  const time = (v: string) => new Date(v).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
  return <section className="space-y-4 rounded-xl border border-border bg-card p-5">
    <div><h3 className="text-xl font-semibold">Pessoas por horário</h3><p className="mt-1 text-sm text-muted-foreground">Pessoas em turnos cadastrados, descontando o intervalo. Períodos consecutivos com a mesma quantidade aparecem juntos.</p></div>
    <div className="flex flex-wrap gap-3"><label className="text-sm">Dia<select className="ml-2 rounded-lg border border-border bg-background p-2" value={activeDate} onChange={e => setDate(e.target.value)}>{dates.map(d => <option key={d} value={d}>{d.split("-").reverse().join("/")}</option>)}</select></label><label className="text-sm">Função<select className="ml-2 rounded-lg border border-border bg-background p-2" value={role} onChange={e => setRole(e.target.value)}><option value="">Todas</option>{roles.map(r => <option key={r}>{r}</option>)}</select></label></div>
    {!rows.length ? <p className="text-sm text-muted-foreground">Nenhuma cobertura para este filtro. Configure as regras de cobertura na aba Cobertura.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-muted"><tr>{["Função","Horário","Escaladas","Necessárias","Situação"].map(t => <th key={t} className="p-3">{t}</th>)}</tr></thead><tbody>{rows.map((b,i) => <tr key={i} className="border-t border-border"><td className="p-3 font-medium">{b.role}</td><td className="p-3">{time(b.start)}–{time(b.end)}{b.end.slice(0,10) !== b.start.slice(0,10) && " (+1 dia)"}</td><td className="p-3">{b.assigned}</td><td className="p-3">{b.required}</td><td className={"p-3 font-medium " + (b.assigned >= b.required ? "text-emerald-600" : "text-red-600")}>{b.assigned >= b.required ? "Coberto" : "Faltam " + (b.required-b.assigned)}</td></tr>)}</tbody></table></div>}
  </section>;
}
