import FullCalendar from "@fullcalendar/react";
import type { EventDropArg } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import timeGridPlugin from "@fullcalendar/timegrid";

import { useMemo } from "react";
import { useScheduleStore } from "../store/scheduleStore";


export function ScheduleCalendar() {
  const { document, moveAssignment, viewMode, setSelectedEmployeeId } = useScheduleStore();
  const events = useMemo(
    () =>
      document.assignments.map((assignment) => {
        const employee = document.employees.find((item) => item.id === assignment.employeeId);
        return {
          id: assignment.id,
          title: `${employee?.name ?? "Funcionario"} · ${assignment.role}`,
          start: assignment.start,
          end: assignment.end,
          classNames: [assignment.source === "solver" ? "event-solver" : "event-manual"]
        };
      }),
    [document.assignments, document.employees]
  );

  function handleDrop(arg: EventDropArg) {
    if (!arg.event.start || !arg.event.end) {
      return;
    }

    moveAssignment(arg.event.id, arg.event.start.toISOString(), arg.event.end.toISOString());
  }

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

      <section className="min-h-0 flex-1 p-4">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView={viewMode === "month" ? "dayGridMonth" : "timeGridWeek"}
          initialDate={document.assignments.map(a => a.start).sort()[0]}
          eventClick={arg => { const assignment = document.assignments.find(a => a.id === arg.event.id); if (assignment) setSelectedEmployeeId(assignment.employeeId); }}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay"
          }}
          slotMinTime="06:00:00"
          slotMaxTime="24:00:00"
          locale="pt-br"
          height="100%"
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
