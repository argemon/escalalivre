import { intervalFor, minutesOf, fixedIntervalOn } from "../lib/intervals";
import { middayClosureFor } from "../lib/coverageRules";
import { localDate } from "../lib/analysis";
import { normalizeRoles } from "../lib/roles";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { sampleDocument, emptyDocument } from "../data/sample";
import { analyzeDocument } from "../lib/analysis";
import type { Employee, EscalaLivreDocument, ScheduleResult, ShiftAssignment } from "../types/schedule";

type Theme = "light" | "dark";
export type ViewMode = "timeline" | "week" | "month" | "heatmap" | "coverage" | "solver";
export type SolverStatus = "idle" | "calculating" | "optimized" | "partial" | "invalid";
type ScheduleState = {
  document: EscalaLivreDocument; analysis: ScheduleResult; theme: Theme; viewMode: ViewMode;
  solverStatus: SolverStatus; selectedRole: string; selectedEmployeeId?: string;
  upsertEmployee: (employee: Employee) => void; deleteEmployee: (id: string) => void;
  setTheme: (theme: Theme) => void; setViewMode: (mode: ViewMode) => void;
  setSolverStatus: (status: SolverStatus) => void; setSelectedRole: (role: string) => void;
  setSelectedEmployeeId: (id?: string) => void; setDocument: (document: EscalaLivreDocument) => void;
  clearAll: () => void;
  setAnalysis: (analysis: ScheduleResult) => void;
  moveAssignment: (id: string, start: string, end: string) => void;
  upsertAssignment: (assignment: ShiftAssignment) => void;
};
const changed = (input: EscalaLivreDocument) => { const document = normalizeRoles(input); document.assignments = document.assignments.map(a => {
  const employee = document.employees.find(e => e.id === a.employeeId);
  if (employee && a.source === "solver" && !a.tags.includes("net-work-duration")) {
    const work=minutesOf((employee.inheritsCompanyDefaults ? document.company.defaultWorkload : employee.workload).defaultShiftDuration);
    const pause=a.break ?? intervalFor(document.company,employee,Date.parse(a.start),Date.parse(a.end));
    if(pause && (Date.parse(a.end)-Date.parse(a.start))/60000 === work) {
      const end=Date.parse(a.end)+Date.parse(pause.end)-Date.parse(pause.start);
      const close=new Date(a.start.slice(0,10)+"T"+document.company.closesAt);
      if(document.company.closesAt<=document.company.opensAt) close.setDate(close.getDate()+1);
      if(end<=+close) a={...a,end:localDate(new Date(end)),break:pause,tags:[...a.tags,"net-work-duration"]};
    }
  }
  if(employee?.fixedInterval && a.source==="solver") {
    const fixed=fixedIntervalOn(employee,Date.parse(a.start));
    const work=minutesOf((employee.inheritsCompanyDefaults ? document.company.defaultWorkload : employee.workload).defaultShiftDuration);
    const end=Date.parse(a.start)+work*60000+(fixed ? Date.parse(fixed.end)-Date.parse(fixed.start) : 0);
    const close=new Date(a.start.slice(0,10)+"T"+document.company.closesAt);if(document.company.closesAt<=document.company.opensAt) close.setDate(close.getDate()+1);
    if(fixed && Date.parse(fixed.start)>Date.parse(a.start) && Date.parse(fixed.end)<end && end<=+close) a={...a,end:localDate(new Date(end)),break:fixed};
  }
  const closure = employee?.worksDuringLunchClosure ? undefined : middayClosureFor(document.company,new Date(a.start));
  if (!closure || Date.parse(a.start) >= closure.end || Date.parse(a.end) <= closure.start) return !a.break && employee ? {...a,break:intervalFor(document.company,employee,Date.parse(a.start),Date.parse(a.end))} : a;
  if(a.break && Date.parse(a.break.start)<=closure.start && Date.parse(a.break.end)>=closure.end) return a;
  return {...a,break:{start:localDate(new Date(Math.max(Date.parse(a.start),closure.start))),end:localDate(new Date(Math.min(Date.parse(a.end),closure.end)))}};
}); return { document, analysis:analyzeDocument(document), solverStatus:"idle" as const }; };
export const useScheduleStore = create<ScheduleState>()(persist((set) => ({
  ...changed(sampleDocument),theme:"light",viewMode:"timeline",selectedRole:"todos",
  setTheme: theme => set({theme}),setViewMode:viewMode => set({viewMode}),
  setSolverStatus:solverStatus => set({solverStatus}),setSelectedRole:selectedRole => set({selectedRole}),
  setSelectedEmployeeId:selectedEmployeeId => set({selectedEmployeeId}),
  setDocument:document => set({...changed(document),selectedEmployeeId:undefined}),
  clearAll: () => set({...changed(emptyDocument()), selectedEmployeeId:undefined, selectedRole:"todos", viewMode:"timeline"}),
  setAnalysis:analysis => set({analysis}),
  upsertEmployee:employee => set(state => ({...changed({...state.document,updatedAt:new Date().toISOString(),
    employees:[...state.document.employees.filter(e => e.id !== employee.id),employee],
    assignments:state.document.assignments.map(a => a.employeeId === employee.id ? {...a,role:employee.role} : a)
  }),selectedEmployeeId:undefined})),
  deleteEmployee:id => set(state => ({...changed({...state.document,updatedAt:new Date().toISOString(),
    employees:state.document.employees.filter(e => e.id !== id),assignments:state.document.assignments.filter(a => a.employeeId !== id)
  }),selectedEmployeeId:undefined})),
  moveAssignment:(id,start,end) => set(state => changed({...state.document,updatedAt:new Date().toISOString(),
    assignments:state.document.assignments.map(a => a.id === id ? {...a,start,end,break:a.break ? {
      start:new Date(Date.parse(a.break.start)+Date.parse(start)-Date.parse(a.start)).toISOString(),
      end:new Date(Date.parse(a.break.end)+Date.parse(start)-Date.parse(a.start)).toISOString()
    } : undefined} : a)
  })),
  upsertAssignment:assignment => set(state => changed({...state.document,updatedAt:new Date().toISOString(),
    assignments:[...state.document.assignments.filter(a => a.id !== assignment.id),assignment]
  }))
}),{
  name:"escalalivre-state",
  partialize:state => ({document:state.document,theme:state.theme,viewMode:state.viewMode}),
  merge:(persisted,current) => {
    const saved = persisted as Partial<ScheduleState> | undefined;
    const document = structuredClone(saved?.document ?? current.document);
    if (document.company.name === "EscalaLivre Demo") document.company.name = "Escala Livre";
    return {...current,...saved,...changed(document)};
  }
}));
