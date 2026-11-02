import { useState } from "react";
import type { CompanyRules, Employee } from "../types/schedule";
import { employeePattern, selectEmployeePattern, selectEmployeeDays, transitionIssues } from "../lib/policies/employeeSchedule";
import { dayLabels } from "../lib/planning";

export function EmployeeScheduleEditor({ employee:e, company, end, onChange }:{employee:Employee;company:CompanyRules;end:string;onChange:(e:Employee)=>void}) {
 const rule=e.inheritsCompanyDefaults?company.defaultWorkload:e.workload;
 const [custom,setCustom]=useState(false);
 const pattern=custom?"custom":employeePattern(rule),automatic=Boolean(rule.weeklyPlan?.flexibleWorkDays)||!e.workingDays;
 return <fieldset className="space-y-3 rounded border border-border p-3"><legend>Escala do funcionário</legend>
  <label className="block">Modelo de escala<select value={e.inheritsCompanyDefaults?"company":pattern} onChange={event=>{
   const choice=event.target.value;setCustom(choice==="custom");
   if(choice==="company"){onChange({...e,inheritsCompanyDefaults:true,workload:{...company.defaultWorkload}});return;}
   if(choice!=="custom")onChange(selectEmployeePattern(e,company,Number(choice)));
   else onChange({...e,inheritsCompanyDefaults:false,workingDays:e.workingDays??[...company.operatingDays],workload:{...rule,weeklyPlan:rule.weeklyPlan?{...rule.weeklyPlan,flexibleWorkDays:undefined}:undefined}});
  }}><option value="company">Usar padrão da empresa</option><option value="5">5x2 — cinco dias de trabalho e duas folgas</option><option value="6">6x1 — seis dias de trabalho e uma folga</option><option value="custom">Ciclo personalizado</option></select></label>
  <p className="text-xs text-muted-foreground">A escala pertence à pessoa. O funcionamento da empresa e a cobertura definem onde há trabalho disponível. Escolher um modelo cria uma configuração individual; confira a carga contratada sugerida abaixo.</p>
  {!e.inheritsCompanyDefaults&&pattern!=="custom"&&<label className="flex gap-2"><input type="checkbox" checked={automatic} onChange={event=>onChange(selectEmployeeDays(e,company,event.target.checked))} />Deixar o programa escolher os dias de trabalho e as folgas</label>}
  {!e.inheritsCompanyDefaults&&pattern==="custom"&&<label><input type="checkbox" checked={Boolean(e.workingDays)} onChange={event=>onChange({...e,workingDays:event.target.checked?[...company.operatingDays]:undefined})} /> Restringir a dias específicos da semana</label>}
  {!e.inheritsCompanyDefaults&&!automatic&&<fieldset><legend>Dias fixos permitidos</legend><div className="flex flex-wrap gap-2">{dayLabels.map((day,i)=><label key={day}><input type="checkbox" checked={e.workingDays?.includes(i)??false} onChange={event=>onChange({...e,workingDays:event.target.checked?[...(e.workingDays??[]),i]:e.workingDays?.filter(d=>d!==i)})} /> {day}</label>)}</div><p className="text-xs">Confira também a distribuição da carga nesses dias. Marcar um dia permite trabalho, mas não obriga o gerador a criar turnos sem demanda.</p></fieldset>}
  <p className="text-xs text-muted-foreground">No modo automático, o gerador escolhe os dias em conjunto com os horários, respeitando o ciclo em qualquer janela de sete dias, inclusive com histórico fora do período. 5x2 não significa necessariamente folgar sábado e domingo, nem duas folgas consecutivas. Falta de demanda ou restrições podem deixar dias e carga sem atendimento.</p>
  <details className="text-xs"><summary>Mudanças da legislação e transição</summary><p>A EC 141/2026 foi publicada em 16/10/2026. Seu texto prevê dois repousos e até 42h normais após dois meses, e até 40h um ano depois desse prazo, sem redução salarial. Há exceções por negociação coletiva e enquadramento. Os avisos usam 16/12/2026 e 16/12/2027; confira o instrumento aplicável. O sistema não converte uma escala 6x1 nem reduz contratos automaticamente.</p><a className="underline" href="https://www2.camara.leg.br/legin/fed/emecon/2026/emendaconstitucional-141-16-outubro-2026-800062-publicacaooriginal-181622-pl.html" target="_blank" rel="noreferrer">Consultar texto oficial</a></details>
  {transitionIssues(company,e,end).length>0&&<p role="status" className="text-amber-700 dark:text-amber-300">O período alcança a transição da EC 141/2026. Revise a quantidade de folgas e a carga normal; a configuração atual pode exigir adequação ao enquadramento aplicável.</p>}
 </fieldset>;
}
