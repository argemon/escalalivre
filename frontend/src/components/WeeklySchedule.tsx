import { useState } from "react";
import { datePart, displayClock, timePart } from "../lib/dateTime";
import { authorizedHolidayShift, holidayOn } from "../lib/holidays";
import { weekStart } from "../lib/printSchedule";
import { weeklyCoverage } from "../lib/weeklyCoverage";
import { outsideOperatingHours } from "../lib/coverageRules";
import { dayLabels } from "../lib/planning";
import { useScheduleStore } from "../store/scheduleStore";
import { Button } from "./ui";

const dateKey = (day: Date) => [day.getFullYear(), String(day.getMonth() + 1).padStart(2, "0"), String(day.getDate()).padStart(2, "0")].join("-");

export function WeeklySchedule() {
  const { document, setSelectedEmployeeId } = useScheduleStore();
  const [anchor, setAnchor] = useState(() => document.planningPeriod.start);
  const first = weekStart(new Date(anchor + "T00:00:00"));
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(first);
    day.setDate(day.getDate() + index);
    const key = dateKey(day);
    const inPeriod = key >= document.planningPeriod.start && key <= document.planningPeriod.end;
    const holiday = holidayOn(document.company, key);
    return { day, key, inPeriod, holiday, closed: !document.company.operatingDays.includes(day.getDay()) || Boolean(holiday?.closed), shifts: inPeriod ? weeklyCoverage(document, key) : [] };
  });
  const changeWeek = (offset: number) => {
    const day = new Date(first);
    day.setDate(day.getDate() + offset);
    setAnchor(dateKey(day));
  };
  const dateLabel = (day: Date) => day.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  return <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div><h2 className="text-lg font-semibold">Escala semanal</h2><p className="text-xs text-muted-foreground">{dateLabel(first)} a {dateLabel(days[6].day)} · {document.employees.length} pessoas</p></div>
      <div className="flex gap-2">
        <Button className="h-8 px-3 text-xs" disabled={dateKey(first) <= document.planningPeriod.start} onClick={() => changeWeek(-7)}>Anterior</Button>
        <Button className="h-8 px-3 text-xs" onClick={() => { const today = dateKey(new Date()); setAnchor(today < document.planningPeriod.start || today > document.planningPeriod.end ? document.planningPeriod.start : today); }}>Hoje</Button>
        <Button className="h-8 px-3 text-xs" disabled={days[6].key >= document.planningPeriod.end} onClick={() => changeWeek(7)}>Próxima</Button>
      </div>
    </header>
    <section className="min-h-0 flex-1 overflow-auto p-3" aria-label="Horários da semana por pessoa">
      <table className="w-full min-w-[820px] table-fixed border-separate border-spacing-0 text-left text-xs">
        <caption className="pb-3 text-left text-xs text-muted-foreground">Uma linha por pessoa. Prévia: horário estimado; gere a escala para confirmar. +1d: termina no dia seguinte.</caption>
        <thead className="sticky top-0 z-10">
          <tr>
            <th scope="col" className="sticky left-0 z-20 w-40 border border-border bg-card px-3 py-2 font-semibold">Pessoa / Função</th>
            {days.map(({ day, key, inPeriod, holiday, closed }) => <th key={key} scope="col" title={holiday?.name} className={"border-y border-r border-border px-2 py-2 font-semibold " + (!inPeriod || closed ? "bg-muted" : "bg-card")}>
              <span className="block">{dayLabels[day.getDay()]} · {dateLabel(day)}</span>
              {!inPeriod ? <span className="block text-[10px] font-normal text-muted-foreground">Fora do período</span> : holiday ? <span className="block text-[10px] font-normal text-muted-foreground">{holiday.name}{closed ? " · Fechada" : ""}</span> : closed ? <span className="block text-[10px] font-normal text-muted-foreground">Empresa fechada</span> : null}
            </th>)}
          </tr>
        </thead>
        <tbody>
          {document.employees.map(employee => <tr key={employee.id}>
            <th scope="row" className="sticky left-0 z-[1] border-x border-b border-border bg-card px-3 py-3 align-top font-normal">
              <button className="text-left hover:text-primary" onClick={() => setSelectedEmployeeId(employee.id)}><span className="block break-words text-sm font-semibold">{employee.name}</span><span className="block text-xs text-muted-foreground">{employee.role}</span></button>
            </th>
            {days.map(({ day, key, inPeriod, closed, shifts }) => {
              const personShifts = shifts.filter(shift => shift.employeeId === employee.id).sort((a, b) => a.start.localeCompare(b.start));
              return <td key={key} className={"border-r border-b border-border px-2 py-3 align-top " + (!inPeriod || closed && !personShifts.length ? "bg-muted/40" : "bg-card")}>
                {personShifts.length ? <div className="space-y-2">{personShifts.map(shift => {
                  const overnight = datePart(shift.end) > datePart(shift.start);
                  const label = displayClock(shift.start) + "–" + displayClock(shift.end) + (overnight ? " +1d" : "");
                  const outside = !authorizedHolidayShift(document.company, shift) && outsideOperatingHours(document.company, day.getDay(), timePart(shift.start), timePart(shift.end));
                  return <button key={shift.id} className={"block w-full rounded border-l-2 pl-2 text-left " + (outside ? "border-amber-500" : shift.planned ? "border-dashed border-border" : "border-primary")} title={employee.name + " · " + dateLabel(day) + " · " + label} onClick={() => setSelectedEmployeeId(employee.id)}>
                    <span className="block font-semibold tabular-nums">{label}</span>
                    {shift.break && <span className="block text-[10px] text-muted-foreground">Int. {displayClock(shift.break.start)}–{displayClock(shift.break.end)}</span>}
                    {shift.planned && <span className="block text-[10px] text-muted-foreground">Prévia</span>}
                    {outside && <span className="block text-[10px] text-amber-700 dark:text-amber-300">Fora do expediente</span>}
                  </button>;
                })}</div> : <span className="text-muted-foreground">{!inPeriod ? "—" : closed ? "Fechada" : "Sem turno"}</span>}
              </td>;
            })}
          </tr>)}
          {!document.employees.length && <tr><td colSpan={8} className="border-x border-b border-border bg-card p-5 text-center text-muted-foreground">Adicione pessoas na etapa Equipe para visualizar a escala semanal.</td></tr>}
        </tbody>
      </table>
    </section>
  </main>;
}
