import { datePart, timePart, displayClock, nowInstant } from "../lib/dateTime";
import { useState } from "react";
import { useScheduleStore } from "../store/scheduleStore";
import { holidayOn } from "../lib/holidays";
import { intervalFor } from "../lib/intervals";
import { localDate } from "../lib/analysis";
import type { ShiftAssignment } from "../types/schedule";
import { TimeInput } from "./TimeInput";
import { Button } from "./ui";

export function HolidayEditor({date,onClose}:{date:string;onClose:()=>void}) {
  const {document,setDocument}=useScheduleStore();
  const current=holidayOn(document.company,date);
  const [name,setName]=useState(current?.name ?? "");
  const [closed,setClosed]=useState(current?.closed ?? true);
  const initial=document.assignments.filter(a=>datePart(a.start)===date);
  const [shifts,setShifts]=useState<ShiftAssignment[]>(initial);
  const [employeeId,setEmployeeId]=useState(document.employees[0]?.id ?? "");
  const [startsAt,setStartsAt]=useState(document.company.opensAt);
  const [endsAt,setEndsAt]=useState(document.company.closesAt);
  const [error,setError]=useState("");
  const [editingId,setEditingId]=useState<string>();
  const addShift=()=>{
    const employee=document.employees.find(e=>e.id===employeeId);
    if(!employee) {setError("Selecione uma pessoa da equipe.");return;}
    if(!/^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(startsAt) || !/^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(endsAt)) {setError("Informe entrada e saída no formato HH:mm.");return;}
    if(startsAt.slice(0,5)===endsAt.slice(0,5)) {setError("Entrada e saída devem ser diferentes.");return;}
    if(shifts.some(a=>a.employeeId===employeeId && a.id!==editingId)) {setError("Esta pessoa já tem um turno neste dia. Edite o turno existente.");return;}
    const start=new Date(date+"T"+startsAt),end=new Date(date+"T"+endsAt);
    if(end<=start) end.setDate(end.getDate()+1);
    const previous=shifts.find(a=>a.id===editingId);
    const shift:ShiftAssignment={id:editingId ?? crypto.randomUUID(),employeeId,role:employee.role,roleId:employee.roleId,start:localDate(start),end:localDate(end),break:intervalFor(document.company,employee,+start,+end),source:"manual",tags:[...(previous?.tags ?? []).filter(t=>!t.startsWith("holiday:")),"holiday:"+date]};
    setShifts(rows=>[...rows.filter(a=>a.id!==shift.id),shift]);setEditingId(undefined);setError("");
  };
  const save=()=>{
    if(editingId) {setError("Aplique a edição do turno antes de salvar o feriado.");return;}
    if(!name.trim()) {setError("Informe o nome do feriado.");return;}
    setDocument({...document,company:{...document.company,holidays:[...(document.company.holidays ?? []).filter(h=>h.date!==date),{date,name:name.trim(),closed}]},assignments:[...document.assignments.filter(a=>!initial.some(i=>i.id===a.id)),...shifts],updatedAt:nowInstant()});onClose();
  };
  const inputClass="w-full rounded border border-border bg-background p-2";
  return <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
    <form role="dialog" aria-modal="true" aria-label="Feriado no calendário" className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-xl border border-border bg-card p-5" onSubmit={e=>{e.preventDefault();save();}}>
      <h2 className="text-xl font-semibold">Feriado · {date.split("-").reverse().join("/")}</h2>
      <label className="block space-y-2">Nome do feriado<input autoFocus required value={name} onChange={e=>setName(e.target.value)} className={inputClass} placeholder="Ex.: aniversário da cidade" /></label>
      {current?.national && <p className="text-sm text-muted-foreground">Feriado nacional. Você pode configurar o funcionamento nesta data.</p>}
      <label className="flex gap-2"><input type="checkbox" checked={closed} onChange={e=>setClosed(e.target.checked)} />Empresa fechada neste feriado</label>
      <p className="text-sm text-muted-foreground">Com a empresa fechada, a equipe regular fica fora da geração e da prévia. Você pode adicionar turnos específicos abaixo, por exemplo para os seguranças, mantendo o fechamento para as demais pessoas.</p>
      <section className="space-y-3 rounded-xl border border-border p-4" aria-label="Escala no feriado">
        <h3 className="font-semibold">Escala no feriado</h3>
        <p className="text-sm text-muted-foreground">Os turnos adicionados aqui serão mantidos ao gerar a escala. Intervalos, disponibilidade, descanso e limites de jornada continuam sendo conferidos.</p>
        {!document.employees.length ? <p className="text-sm">Cadastre pessoas na equipe para adicionar turnos.</p> : <>
          <div className="grid gap-3 sm:grid-cols-3">
            <label>Pessoa<select className={inputClass} value={employeeId} onChange={e=>setEmployeeId(e.target.value)}>{document.employees.map(e=><option key={e.id} value={e.id}>{e.name} · {e.role}</option>)}</select></label>
            <label>Entrada<TimeInput value={startsAt} onChange={setStartsAt} className={inputClass} aria-label="Entrada do turno no feriado" /></label>
            <label>Saída<TimeInput value={endsAt} onChange={setEndsAt} className={inputClass} aria-label="Saída do turno no feriado" /></label>
          </div>
          <p className="text-xs text-muted-foreground">Se a saída for anterior à entrada, o turno termina no dia seguinte. O intervalo segue a configuração da pessoa e da empresa.</p>
          <div className="flex gap-2"><Button type="button" onClick={addShift}>{editingId ? "Aplicar edição do turno" : "Adicionar turno"}</Button>{editingId && <Button type="button" onClick={()=>{setEditingId(undefined);setError("");}}>Cancelar edição</Button>}</div>
        </>}
        {shifts.length===0 && <p className="text-sm text-muted-foreground">Nenhuma pessoa escalada neste feriado.</p>}
        <ul className="space-y-2">{shifts.map(a=><li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-3">
          <div><strong>{document.employees.find(e=>e.id===a.employeeId)?.name ?? "Pessoa removida"} · {a.role}</strong><p className="text-sm">{displayClock(a.start)}–{displayClock(a.end)}{datePart(a.end)!==date && " (dia seguinte)"}{a.break && " · Intervalo "+displayClock(a.break.start)+"–"+displayClock(a.break.end)}</p></div>
          <div className="flex gap-2"><Button type="button" onClick={()=>{setEditingId(a.id);setEmployeeId(a.employeeId);setStartsAt(timePart(a.start));setEndsAt(timePart(a.end));setError("");}}>Editar</Button><Button type="button" onClick={()=>{setShifts(rows=>rows.filter(s=>s.id!==a.id));if(editingId===a.id)setEditingId(undefined);}}>Remover</Button></div>
        </li>)}</ul>
      </section>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2"><Button type="submit">Salvar feriado e escala</Button><Button type="button" onClick={onClose}>Cancelar</Button>{current && !current.national && <Button type="button" onClick={()=>{setDocument({...document,company:{...document.company,holidays:document.company.holidays?.filter(h=>h.date!==date)},updatedAt:nowInstant()});onClose();}}>Remover feriado local</Button>}</div>
    </form>
  </div>;
}
