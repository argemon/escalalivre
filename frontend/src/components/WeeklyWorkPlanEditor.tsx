import { useState } from "react";
import type { WeeklyWorkPlan } from "../types/schedule";
import { distributeWeekly, durationSeconds, secondsDuration, plannedExit, weeklyPlanIssues, weeklyPlanMessages, weeklyPlanTotal } from "../lib/policies/weeklyWorkPlan";
import { dayLabels } from "../lib/planning";
import { DurationInput } from "./DurationInput";
import { flexibleDayDuration } from "../lib/policies/employeeSchedule";

export function WeeklyWorkPlanEditor({value,onChange,ceiling,entry,pause}:{value?:WeeklyWorkPlan;onChange:(plan:WeeklyWorkPlan|undefined)=>void;ceiling:number;entry:string;pause:string}) {
  const [mode,setMode]=useState("custom");
  const [days,setDays]=useState([1,2,3,4,5]);
  const [friday,setFriday]=useState("08:00:00");
  const [error,setError]=useState("");
  const update=(plan:WeeklyWorkPlan)=>{setError("");onChange(plan);};
  function preset(){if(!value)return;try{update({...distributeWeekly(value.contractedSeconds,days,mode==="friday"?durationSeconds(friday):undefined),compensation:value.compensation});}catch{setError("Confira carga, dias contratuais e duração da sexta.");}}
  return <fieldset className="space-y-3 rounded border border-border p-3"><legend>Carga contratada e distribuição</legend>
    <p className="text-sm">A geração prioriza cobertura, depois carga contratada e preferências. Salvar preserva todos os turnos e pausas; falta de carga é informada separadamente da cobertura.</p>
    <label className="flex gap-2"><input type="checkbox" checked={Boolean(value)} onChange={e=>onChange(e.target.checked?{contractedSeconds:144000,dailySeconds:[0,28800,28800,28800,28800,28800,0]}:undefined)} />Definir carga contratada (independente do teto)</label>
    {!value?<p>Sem mínimo contratado informado: não será possível calcular horas faltantes. Ative a carga e confira a distribuição diária; o máximo não define o mínimo.</p>:<>
      <label className="block">Mínimo semanal — jornada contratada (HH:MM:SS)<DurationInput showSeconds required value={secondsDuration(value.contractedSeconds)} onChange={v=>update({...value,contractedSeconds:durationSeconds(v)})} /></label>
      <p className="text-xs">Este mínimo é a jornada normal a cumprir na semana completa, sem pausas e sem horas extras. Uma saída antecipada mantém as horas faltantes visíveis.</p>
      {value.flexibleWorkDays?<p>O programa escolhe até {value.flexibleWorkDays} dias por semana, com até {secondsDuration(flexibleDayDuration(value))} de trabalho normal por dia escolhido, ajustando os segundos restantes. Contratada: {secondsDuration(value.contractedSeconds)} · Máximo: {ceiling}h. Não há carga fixa em cada dia da semana. Feriados sem dia contratual definido não concedem crédito automaticamente; registre dispensas quando aplicáveis.</p>:<>
      <label className="block">Distribuição<select value={mode} onChange={e=>setMode(e.target.value)}><option value="uniform">Uniforme</option><option value="friday">Sexta reduzida</option><option value="custom">Personalizada</option></select></label>
      {mode!=="custom"&&<><fieldset><legend>Dias contratuais (independentes da abertura)</legend>{dayLabels.map((d,i)=><label key={d} className="mr-2"><input type="checkbox" checked={days.includes(i)} onChange={e=>setDays(e.target.checked?[...days,i]:days.filter(d=>d!==i))} />{d}</label>)}</fieldset>
      {mode==="friday"&&<label>Sexta: trabalho líquido<DurationInput showSeconds value={friday} onChange={setFriday} /></label>}
      <button type="button" onClick={preset}>Aplicar distribuição à carga informada</button></>}
      <p className="text-xs">Os modelos preenchem os mesmos sete valores abaixo. Para 44h, uniforme em cinco dias resulta em 8h48; sexta de 8h resulta em 9h nos outros quatro dias.</p>
      {dayLabels.map((day,i)=><label className="block" key={day}>{day} — trabalho líquido<DurationInput showSeconds required value={secondsDuration(value.dailySeconds[i])} onChange={v=>update({...value,dailySeconds:value.dailySeconds.map((s,j)=>i===j?durationSeconds(v):s)})} /><span className="block text-xs">{value.dailySeconds[i]>0?`Entrada ${entry}, pausa ${pause}: saída estimada ${plannedExit(entry,value.dailySeconds[i],durationSeconds(pause))}`:"Sem trabalho contratual"}</span></label>)}
      <p>Soma diária: {secondsDuration(weeklyPlanTotal(value))} · Contratada: {secondsDuration(value.contractedSeconds)} · Teto: {ceiling}h</p>
      <p className="text-xs">Prévia aritmética com a pausa informada; fechamento, intervalo individual e rotina semanal podem impedir esses horários. A sexta reduzida conserva a mesma rotina de pausa da semana.</p>
      </>}
      <label className="flex gap-2"><input type="checkbox" checked={Boolean(value.compensation)} onChange={e=>update({...value,compensation:e.target.checked?{instrument:"",startsOn:"",endsOn:""}:undefined})} />Compensação semanal (separada de horas extras)</label>
      {value.compensation&&<><label>Instrumento de compensação<input required maxLength={200} value={value.compensation.instrument} onChange={e=>update({...value,compensation:{...value.compensation!,instrument:e.target.value}})} /></label><label>Vigência inicial<input required type="date" value={value.compensation.startsOn} onChange={e=>update({...value,compensation:{...value.compensation!,startsOn:e.target.value}})} /></label><label>Vigência final<input required type="date" value={value.compensation.endsOn} onChange={e=>update({...value,compensation:{...value.compensation!,endsOn:e.target.value}})} /></label></>}
      {weeklyPlanIssues(value,ceiling).map(code=><p role="status" key={code}>{weeklyPlanMessages[code]}</p>)}
    </>}{error&&<p role="alert">{error}</p>}
  </fieldset>;
}
