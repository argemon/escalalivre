import { timePart, formatCivilDateTime } from "../lib/dateTime";
import { exclusivePeriodEnd } from "../lib/planningPeriod";
import { Button } from "./ui";
import { holidayOn, authorizedHolidayShift } from "../lib/holidays";
import { HolidayEditor } from "./HolidayEditor";
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
  const [visibleDate,setVisibleDate] = useState(() => dateKey(new Date()));
  const [holidayPickerDate,setHolidayPickerDate] = useState(() => dateKey(new Date()));
  const [addingHoliday,setAddingHoliday] = useState(false);
  const [holidayDate,setHolidayDate] = useState<string>();
  function dateKey(d:Date) { return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-"); }
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
          title: `${!authorizedHolidayShift(document.company,assignment) && outsideOperatingHours(document.company,new Date(assignment.start).getDay(),timePart(assignment.start),timePart(assignment.end)) ? "⚠ Fora do expediente · " : ""}${employee?.name ?? "Funcionario"} · ${assignment.role}`,
          extendedProps: {employeeId:assignment.employeeId,role:assignment.role,break:assignment.break,planned:"planned" in assignment && assignment.planned},
          editable: !("planned" in assignment && assignment.planned),
          start: assignment.start,
          end: assignment.end,
          classNames: ["month-assignment", "planned" in assignment && assignment.planned ? "month-preview" : "month-saved"]
        };
      }),
    [visibleAssignments, document.employees, document.company]
  );

  function handleDrop(arg: EventDropArg) {
    if (!arg.event.start || !arg.event.end) {
      return;
    }

    moveAssignment(arg.event.id, formatCivilDateTime(arg.event.start), formatCivilDateTime(arg.event.end));
  }

  if (viewMode === "week") return <WeeklySchedule />;

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2 text-xs text-muted-foreground" aria-label="Resumo da escala mensal">
        <span>{document.employees.length} pessoas</span>
        <span>{document.assignments.length} turnos salvos</span>
        <span>{new Set(document.employees.map(employee=>employee.role)).size} funções</span>
        <span>{document.company.coverage.length} regras de cobertura</span>
        <Button className="ml-auto h-8 px-3 text-xs" type="button" onClick={()=>{setHolidayPickerDate(visibleDate);setAddingHoliday(true);}}>Adicionar feriado</Button>
        <details className="calendar-help"><summary>Ajuda</summary><div><p>Clique no número do dia para editar feriados e turnos especiais.</p><p>Prévia: horário estimado. Salvo: turno cadastrado ou gerado. Verde: hoje.</p></div></details>
      </div>

      {addingHoliday && <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"><form role="dialog" aria-modal="true" aria-label="Adicionar feriado" className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-5" onSubmit={e=>{e.preventDefault();const chosenDate=String(new FormData(e.currentTarget).get("holidayDate"));setAddingHoliday(false);setHolidayDate(chosenDate);}}><h2 className="text-xl font-semibold">Adicionar feriado</h2><label className="block">Data<input type="date" name="holidayDate" required value={holidayPickerDate} onChange={e=>setHolidayPickerDate(e.target.value)} className="mt-2 w-full rounded border border-border bg-background p-2" /></label><div className="flex gap-2"><Button type="submit">Continuar</Button><Button type="button" onClick={()=>setAddingHoliday(false)}>Cancelar</Button></div></form></div>}
      <section className="min-h-0 flex-1 overflow-hidden p-4 monthly-calendar">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView={viewMode === "month" ? "dayGridMonth" : "timeGridWeek"}
          key={document.id+document.planningPeriod.start+document.planningPeriod.end}
          initialDate={document.planningPeriod.start}
          validRange={{start:document.planningPeriod.start,end:exclusivePeriodEnd(document)}}
          eventClick={arg => setSelectedEmployeeId(arg.event.extendedProps.employeeId)}
          datesSet={arg => {setVisibleDate(dateKey(arg.view.currentStart));setRange(previous => previous?.start.getTime() === arg.start.getTime() && previous?.end.getTime() === arg.end.getTime() ? previous : {start:arg.start,end:arg.end});}}
          buttonText={{today:"Hoje"}}
          displayEventTime={false}
          eventContent={arg => <div className="month-entry"><strong>{arg.event.title}</strong><small className="month-status">{arg.event.extendedProps.planned ? "Prévia" : "Salvo"}</small><span>{arg.event.start?.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}–{arg.event.end?.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</span>{arg.event.extendedProps.break && <small>Intervalo {new Date(arg.event.extendedProps.break.start).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}–{new Date(arg.event.extendedProps.break.end).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</small>}</div>}
          dayMaxEvents={3}
          expandRows={false}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: ""
          }}
          businessHours={{ daysOfWeek: document.company.operatingDays, startTime: document.company.opensAt, endTime: document.company.closesAt }}
          slotMinTime="00:00:00"
          slotMaxTime="24:00:00"
          dayCellClassNames={arg => holidayOn(document.company,dateKey(arg.date)) ? ["calendar-holiday"] : document.company.operatingDays.includes(arg.date.getDay()) ? [] : ["bg-muted", "text-muted-foreground"]}
          dayCellContent={arg => { const holiday=holidayOn(document.company,dateKey(arg.date)); return <button type="button" className="text-right" title={holiday ? "Editar feriado e turnos: "+holiday.name : "Adicionar feriado ou turnos neste dia"} aria-label={(holiday ? "Editar feriado e turnos em " : "Adicionar feriado em ")+dateKey(arg.date)} onClick={()=>setHolidayDate(dateKey(arg.date))}>{arg.dayNumberText}{holiday ? <small className="block font-semibold">Feriado · {holiday.name}{holiday.closed ? " · Fechada" : " · Aberta"}</small> : !document.company.operatingDays.includes(arg.date.getDay()) && <small className="ml-1">Fechada</small>}</button>; }}
          timeZone="local"
          locale="pt-br"
          firstDay={0}
          height="100%"
          editable
          droppable
          nowIndicator
          events={events}
          eventDrop={handleDrop}
        />
      </section>
      {holidayDate && <HolidayEditor key={holidayDate} date={holidayDate} onClose={()=>setHolidayDate(undefined)} />}
    </main>
  );
}
