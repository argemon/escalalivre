import { holidayOn } from "../lib/holidays";
import { weeklyCoverage } from "../lib/weeklyCoverage";
import { useState } from "react";
import { useScheduleStore } from "../store/scheduleStore";
import { outsideOperatingHours } from "../lib/coverageRules";
import { dayLabels } from "../lib/planning";
import { Button } from "./ui";
const dateKey = (d: Date) => [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
export function WeeklySchedule() {
  const { document, setSelectedEmployeeId } = useScheduleStore();
  const [anchor,setAnchor] = useState(() => document.assignments.map(a => a.start.slice(0,10)).sort()[0] ?? dateKey(new Date()));
  const first = new Date(anchor+"T00:00:00"); first.setDate(first.getDate()-((first.getDay()+6)%7));
  const dates = Array.from({length:7},(_,i) => { const day = new Date(first); day.setDate(day.getDate()+i); return day; });
  const changeWeek = (offset: number) => { const d = new Date(first); d.setDate(d.getDate()+offset); setAnchor(dateKey(d)); };
  const weekRows = dates.map(day => ({day,key:dateKey(day),shifts:weeklyCoverage(document,dateKey(day))}));
  const hours = (value: string) => { const [h,m] = value.split(":").map(Number); return h+m/60; };
  const opening = hours(document.company.opensAt), closing = hours(document.company.closesAt)+(hours(document.company.closesAt)<=opening ? 24 : 0);
  const startHour = Math.floor(Math.min(opening,...weekRows.flatMap(row => row.shifts.map(a => (Date.parse(a.start)-Date.parse(row.key+"T00:00:00"))/3600000))));
  const endHour = Math.ceil(Math.max(closing,...weekRows.flatMap(row => row.shifts.map(a => (Date.parse(a.end)-Date.parse(row.key+"T00:00:00"))/3600000))));
  const span = Math.max(1,endHour-startHour);
  const position = (value: string, day: string) => (Date.parse(value)-Date.parse(day+"T00:00:00"))/3600000;
  return <main className="flex min-w-0 flex-1 flex-col bg-background"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4"><div><h2 className="text-xl font-semibold">Escala semanal</h2><p className="text-sm text-muted-foreground">{document.company.name} · {document.company.opensAt.slice(0,5)}–{document.company.closesAt.slice(0,5)} · {document.company.operatingDays.map(d => dayLabels[d]).join(", ")}</p></div><div className="flex gap-2"><Button onClick={() => changeWeek(-7)}>Anterior</Button><Button onClick={() => setAnchor(dateKey(new Date()))}>Hoje</Button><Button onClick={() => changeWeek(7)}>Próxima</Button></div></header><section className="min-h-0 flex-1 overflow-auto p-5"><p className="mb-3 text-sm text-muted-foreground">Tracejado: cobertura prevista pelos dias da função e do funcionário · Sólido: turno cadastrado · Âmbar: fora do expediente · +1d: dia seguinte</p><p className="mb-3 text-xs text-muted-foreground">A cobertura prevista indica os períodos em comum. Gere a escala para aplicar limites de jornada, folgas e descanso.</p><div className="min-w-[960px] rounded border border-border bg-card"><div className="sticky top-0 z-10 grid grid-cols-[180px_1fr] border-b border-border bg-card"><div className="p-3 text-sm">Dia / Pessoa</div><div className="relative h-10">{Array.from({length:span},(_,i) => startHour+i).map(h => <span key={h} className="absolute border-l border-border px-1 py-2 text-xs" style={{left:(h-startHour)/span*100+"%"}}>{String(h%24).padStart(2,"0")}h{h>=24 ? " +1d" : ""}</span>)}</div></div>{weekRows.map(({day,key,shifts}) => {
    const holiday=holidayOn(document.company,key);
    const open = document.company.operatingDays.includes(day.getDay()) && !holiday?.closed;
    return <div key={key}><div className="border-b border-border bg-muted px-3 py-2 text-sm font-semibold">{dayLabels[day.getDay()]} · {day.toLocaleDateString("pt-BR")} · {open ? "Em funcionamento" : "Empresa fechada"}{holiday && " · Feriado: "+holiday.name}</div>{shifts.length === 0 && <div className="p-3 text-sm text-muted-foreground">Sem turnos ou cobertura prevista neste dia</div>}{shifts.map(a => {
      const employee = document.employees.find(e => e.id === a.employeeId);
      const from = position(a.start,key), to = position(a.end,key);
      const outside = outsideOperatingHours(document.company,day.getDay(),a.start.slice(11,19),a.end.slice(11,19));
      const label = a.start.slice(11,16)+"–"+a.end.slice(11,16)+(to>=24 ? " +1d" : "");
      return <div key={a.id} className="grid grid-cols-[180px_1fr] border-b border-border"><button className="border-r border-border p-3 text-left text-sm hover:bg-muted" onClick={() => setSelectedEmployeeId(a.employeeId)}>{employee?.name}<span className="block text-xs text-muted-foreground">{a.role}</span></button><div className="relative h-20 bg-[linear-gradient(90deg,hsl(var(--border))_1px,transparent_1px)] bg-[length:4.166%_100%]"><button onClick={() => setSelectedEmployeeId(a.employeeId)} title={label+(a.planned ? " · Cobertura prevista; gere a escala para definir jornada, intervalo e descanso" : " · Turno cadastrado")+(outside ? " · Fora do expediente" : "")} className={"absolute top-3 h-14 overflow-hidden rounded border px-2 text-left text-xs "+(a.planned ? "border-dashed " : "")+(outside ? "border-amber-500 bg-amber-500/20" : "border-emerald-500 bg-emerald-500/20")} style={{left:(Math.max(startHour,from)-startHour)/span*100+"%",width:Math.max(1,(Math.min(endHour,to)-Math.max(startHour,from))/span*100)+"%"}}>{label}{a.planned && <span className="block">Cobertura prevista</span>}{outside && <span className="block font-semibold">Fora do expediente</span>}{a.break && <span className="absolute bottom-0 h-2 bg-amber-400" title={"Intervalo: "+a.break.start.slice(11,16)+"–"+a.break.end.slice(11,16)} style={{left:(position(a.break.start,key)-from)/(to-from)*100+"%",width:(position(a.break.end,key)-position(a.break.start,key))/(to-from)*100+"%"}} />}</button></div></div>;
    })}</div>;
  })}</div></section></main>;
}
