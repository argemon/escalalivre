import FullCalendar from "@fullcalendar/react";
import type { EventDropArg } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import timeGridPlugin from "@fullcalendar/timegrid";

import { outsideOperatingHours } from "../lib/coverageRules";
import { WeeklySchedule } from "./WeeklySchedule";
import { weeklyCoverage } from "../lib/weeklyCoverage";
import { useMemo, useState } from "react";
import { useScheduleStore } from "../store/scheduleStore";


export function ScheduleCalendar() {
  const { document, moveAssignment, viewMode, setSelectedEmployeeId } = useScheduleStore();
  const [range,setRange] = useState<{start:Date;end:Date} | null>(null);
  const visibleAssignments = useMemo(() => {
    if (!range) return document.assignments;
    const rows = [];
    for (const day = new Date(range.start); day < range.end; day.setDate(day.getDate()+1)) {
      const key = [day.getFullYear(),String(day.getMonth()+1).padStart(2,"0"),String(day.getDate()).padStart(2,"0")].join("-");
      rows.push(...weeklyCoverage(document,key));
    }
    return rows;
  }, [document,range]);
  const events = useMemo(
    () =>
      visibleAssignments.map((assignment) => {
        const employee = document.employees.find((item) => item.id === assignment.employeeId);
        return {
          id: assignment.id,
          title: `${"planned" in assignment && assignment.planned ? "Disponível · " : "Turno · "}${outsideOperatingHours(document.company,new Date(assignment.start).getDay(),assignment.start.slice(11,19),assignment.end.slice(11,19)) ? "⚠ Fora do expediente · " : ""}${employee?.name ?? "Funcionario"} · ${assignment.role}`,
          extendedProps: {employeeId:assignment.employeeId},
          editable: !("planned" in assignment && assignment.planned),
          start: assignment.start,
          end: assignment.end,
          classNames: [assignment.source === "solver" ? "event-solver" : "event-manual"]
        };
      }),
    [visibleAssignments, document.employees, document.company]
  );

  function handleDrop(arg: EventDropArg) {
    if (!arg.event.start || !arg.event.end) {
      return;
    }

    moveAssignment(arg.event.id, arg.event.start.toISOString(), arg.event.end.toISOString());
  }

  if (viewMode === "week") return <WeeklySchedule />;

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-background">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <p className="text-xs uppercase text-muted-foreground">Planejamento operacional</p>
          <h1 className="text-2xl font-semibold tracking-normal">{document.company.name}</h1>
        </div>

      </header>

      <section className="grid grid-cols-2 gap-px border-b border-border bg-border md:grid-cols-4">
        {[
          ["Funcionarios", document.employees.length],
          ["Turnos", document.assignments.length],
          ["Funcoes", new Set(document.employees.map((employee) => employee.role)).size],
          ["Coberturas", document.company.coverage.length]
        ].map(([label, value]) => (
          <div key={label} className="bg-card px-5 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-semibold">{value}</p>
          </div>
        ))}
      </section>

      <p className="px-5 py-3 text-sm text-muted-foreground">Turno: horário cadastrado · Disponível: previsão conforme dias, horários e restrições. Gere a escala para definir jornadas e folgas.</p>
      <section className="min-h-0 flex-1 overflow-auto p-4">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView={viewMode === "month" ? "dayGridMonth" : "timeGridWeek"}
          initialDate={document.assignments.map(a => a.start).sort()[0]}
          eventClick={arg => setSelectedEmployeeId(arg.event.extendedProps.employeeId)}
          datesSet={arg => setRange(previous => previous?.start.getTime() === arg.start.getTime() && previous?.end.getTime() === arg.end.getTime() ? previous : {start:arg.start,end:arg.end})}
          dayMaxEvents={false}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: ""
          }}
          businessHours={{ daysOfWeek: document.company.operatingDays, startTime: document.company.opensAt, endTime: document.company.closesAt }}
          slotMinTime="00:00:00"
          slotMaxTime="24:00:00"
          dayCellClassNames={arg => document.company.operatingDays.includes(arg.date.getDay()) ? [] : ["bg-muted", "text-muted-foreground"]}
          dayCellContent={arg => <span>{arg.dayNumberText}{!document.company.operatingDays.includes(arg.date.getDay()) && <small className="ml-1">Fechada</small>}</span>}
          locale="pt-br"
          height="auto"
          editable
          droppable
          nowIndicator
          events={events}
          eventDrop={handleDrop}
        />
      </section>
    </main>
  );
}
