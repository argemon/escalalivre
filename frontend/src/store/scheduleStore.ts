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
const changed = (input: EscalaLivreDocument) => { const document = normalizeRoles(input); return { document, analysis:analyzeDocument(document), solverStatus:"idle" as const }; };
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
