import { canCover } from "./coverageAllocation";
import { closedHoliday } from "./holidays";
import { intervalFor, minutesOf, previewPause } from "./intervals";
import type { EscalaLivreDocument, ShiftAssignment } from "../types/schedule";
import { outsideOperatingHours } from "./coverageRules";
export type WeeklyCoverage = ShiftAssignment & { planned?: boolean };
export function weeklyCoverage(document: EscalaLivreDocument, date: string): WeeklyCoverage[] {
  const actual = document.assignments.filter(a => a.start.slice(0,10) === date);
  if (closedHoliday(document.company,date)) return actual;
  const day = new Date(date+"T00:00:00").getDay();
  const predicted: WeeklyCoverage[] = [];
  for (const employee of document.employees) {
    if (actual.some(a => a.employeeId === employee.id)) continue;
    const workingDays = employee.inheritsCompanyDefaults ? document.company.operatingDays : employee.workingDays ?? document.company.operatingDays;
    if (!workingDays.includes(day)) continue;
    const rules = document.company.coverage.filter(r => r.day === day && canCover(employee,r) && r.minimumEmployees > 0);
    if (!rules.length && document.company.operatingDays.includes(day)) rules.push({role:employee.role,day,start:document.company.opensAt,end:document.company.closesAt,minimumEmployees:1});
    for (const [index, rule] of rules.entries()) {
      if (rule.day !== day || !canCover(employee,rule) || rule.minimumEmployees === 0) continue;
      if (!rule.allowsOutsideHours && outsideOperatingHours(document.company,day,rule.start,rule.end)) continue;
      const start = new Date(date+"T"+(employee.shiftStartsAt ?? rule.start)), end = new Date(date+"T"+rule.end);
      if (end <= start) end.setDate(end.getDate()+1);
      let windows = [{start:+start,end:+end}];
      if (employee.availability.length) windows = employee.availability.map(w => ({start:Math.max(+start,Date.parse(w.start)),end:Math.min(+end,Date.parse(w.end))})).filter(w => w.end > w.start);
      for (const restriction of employee.restrictions) {
        const from = Date.parse(restriction.start), to = Date.parse(restriction.end);
        windows = windows.flatMap(w => to <= w.start || from >= w.end ? [w] : [{start:w.start,end:Math.min(from,w.end)},{start:Math.max(to,w.start),end:w.end}].filter(v => v.end > v.start));
      }
      for (const [part, window] of windows.entries()) {
        const workload=employee.inheritsCompanyDefaults ? document.company.defaultWorkload : employee.workload;
        const work=minutesOf(workload.defaultShiftDuration);
        const pause=previewPause(document.company,employee,work,window.start,window.end);
        window.end=Math.min(window.end,window.start+(work+pause)*60000);
        const interval=intervalFor(document.company,employee,window.start,window.end,pause);
        const local = (n: number) => { const d = new Date(n); const pad = (v: number) => String(v).padStart(2,"0"); return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())+"T"+pad(d.getHours())+":"+pad(d.getMinutes())+":00"; };
        if (predicted.some(a => a.employeeId === employee.id && Date.parse(a.start) === window.start && Date.parse(a.end) === window.end)) continue;
        predicted.push({id:"preview-"+date+"-"+employee.id+"-"+index+"-"+part,employeeId:employee.id,role:employee.role,start:local(window.start),end:local(window.end),source:"manual",tags:[],break:interval,planned:true});
      }
    }
  }
  return [...actual,...predicted];
}
