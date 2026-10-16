import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { useScheduleStore } from "../store/scheduleStore";
import { dateKey, displayDate, employeePrintRows, monthBounds } from "../lib/printSchedule";
import { Button } from "./ui";
import { Brand } from "./Brand";

export function PrintSchedule({ onClose }: { onClose: () => void }) {
  const document = useScheduleStore(state => state.document);
  const initialDate = document.assignments.map(a=>a.start.slice(0,10)).sort()[0] ?? dateKey(new Date());
  const [month,setMonth] = useState(initialDate.slice(0,7));
  const bounds = monthBounds(month);
  const rows = employeePrintRows(document,month);
  const hasShifts = rows.some(row=>row.start);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    const previousFocus = window.document.activeElement;
    closeButton.current?.focus();
    return ()=>{if(previousFocus instanceof HTMLElement) previousFocus.focus();};
  },[]);
  return createPortal(<div className="schedule-print-root" role="dialog" aria-modal="true" aria-labelledby="print-title" onKeyDown={event=>{
    if(event.key==="Escape") onClose();
    if(event.key==="Tab") {
      const nodes=event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input');
      const first=nodes[0],last=nodes[nodes.length-1];
      if(event.shiftKey && window.document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey && window.document.activeElement===last){event.preventDefault();first?.focus();}
    }
  }}>
    <div className="schedule-print-controls">
      <div className="flex items-center justify-between gap-4"><div><h2 id="print-title" className="text-xl font-semibold">Imprimir escala da equipe</h2><p className="text-sm text-muted-foreground">Funcionários em ordem alfabética, com dias, horários e intervalos.</p></div><button ref={closeButton} type="button" aria-label="Fechar impressão" onClick={onClose} className="rounded p-2"><X className="size-5" /></button></div>
      <div className="mt-3 flex flex-wrap items-end gap-3"><label className="text-sm">Mês da escala<input type="month" value={month} onChange={e=>setMonth(e.target.value)} className="mt-1 block rounded border border-border bg-background p-2" /></label><Button type="button" disabled={!bounds||!hasShifts} onClick={()=>window.print()}><Printer className="size-4" />Imprimir / Salvar PDF</Button></div>
      <p className="mt-2 text-xs text-muted-foreground">A4 horizontal · Dias consecutivos com os mesmos horários são agrupados · Cabeçalho repetido nas próximas páginas.</p>
      <p className="mt-1 text-xs text-muted-foreground">Desative os cabeçalhos e rodapés do navegador para retirar o endereço do site.</p>
      {!bounds && <p role="alert">Escolha um mês válido.</p>}
      {bounds&&!hasShifts && <p role="status" className="mt-2 text-sm">Não há turnos salvos nesse mês. Gere ou cadastre a escala antes de imprimir.</p>}
    </div>
    <div className="schedule-print-preview">{bounds&&<section className="schedule-print-sheet schedule-list-sheet" aria-label="Escala mensal por funcionário">
      <table className="schedule-print-table schedule-list-table"><colgroup><col style={{width:"28%"}}/><col style={{width:"32%"}}/><col style={{width:"20%"}}/><col style={{width:"20%"}}/></colgroup>
        <thead><tr><th colSpan={4} className="schedule-print-heading"><div className="schedule-print-heading-row"><div className="schedule-list-title"><h1>{document.company.name||"Empresa"}</h1><p>Escala · {displayDate(bounds.start)} a {displayDate(bounds.end)}</p></div><Brand className="schedule-print-brand" /></div></th></tr><tr className="schedule-print-days"><th scope="col">Funcionário / Função</th><th scope="col">Dias de trabalho</th><th scope="col">Entrada – Saída</th><th scope="col">Intervalo</th></tr></thead>
        <tbody>{rows.map((row,index)=>{
          const firstForPerson = index===0 || rows[index-1].person.id!==row.person.id;
          const personRowCount = firstForPerson ? rows.filter(item=>item.person.id===row.person.id).length : 0;
          return <tr key={`${row.person.id}-${index}`} className={firstForPerson ? "schedule-list-person-start" : undefined}>{firstForPerson && <th scope="rowgroup" rowSpan={personRowCount}><strong>{row.person.name}</strong><small>{row.role}</small></th>}<td>{row.start ? row.start===row.end ? displayDate(row.start) : `${displayDate(row.start)} a ${displayDate(row.end)}` : "Sem turnos salvos no mês"}</td><td>{row.hours}</td><td>{row.interval}</td></tr>;
        })}</tbody>
      </table><p className="schedule-print-legend">+1d = dia seguinte · Os dias referem-se à entrada do turno. Intervalos não contam como trabalho. Dias sem turno salvo não confirmam folga.</p>
    </section>}</div>
  </div>,window.document.body);
}
