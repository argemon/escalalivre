import { migrateDocument, normalizeDocument, replaceAssignment } from "../lib/documentLifecycle";
import { recovery, type SavedSchedule } from "../lib/recoveryStorage";
import { parseNativeText, validateNativeDocument } from "../lib/nativeDocument";
import { nowInstant, normalizeResultTimes, moveShift } from "../lib/dateTime";
import { replacePeriodAssignments } from "../lib/scheduleWindow";
import { periodError, type PlanningPeriod } from "../lib/planningPeriod";
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
  setPlanningPeriod: (period: PlanningPeriod) => void;
  importDocument: (document: EscalaLivreDocument) => boolean;
  restoreRecovery: (contents: string) => boolean;
  retryStorage: () => boolean;
  clearAll: () => void;
  setAnalysis: (analysis: ScheduleResult) => void;
  applyGeneratedSchedule: (submitted: EscalaLivreDocument, result: ScheduleResult) => void;
  moveAssignment: (id: string, start: string, end: string) => void;
  upsertAssignment: (assignment: ShiftAssignment) => void;
};
// Edits and hydration recompute analysis without silently rewriting any shift.
const presentDocument=(input:EscalaLivreDocument)=>{
  const document=normalizeDocument(input);
  return {document,analysis:analyzeDocument(document),solverStatus:"idle" as const};
};
const recovered=(input:EscalaLivreDocument)=>presentDocument(validateNativeDocument(input));
let hydratedOnce = false;
export const useScheduleStore = create<ScheduleState>()(persist((set, get) => ({
  ...presentDocument(migrateDocument(sampleDocument).document),theme:"light",viewMode:"timeline",selectedRole:"todos",
  setTheme: theme => set({theme}),setViewMode:viewMode => set({viewMode}),
  setSolverStatus:solverStatus => set({solverStatus}),setSelectedRole:selectedRole => set({selectedRole}),
  setSelectedEmployeeId:selectedEmployeeId => set({selectedEmployeeId}),
  setDocument:document => set({...presentDocument(document),selectedEmployeeId:undefined}),
  importDocument: input => {
    const document = validateNativeDocument(input);
    // Prepare and validate before creating the checkpoint; a rejected import never replaces data.
    const next = recovered(document);
    if(!recovery.checkpoint(get().document,"Antes da importação"))return false;
    set({...next,selectedEmployeeId:undefined,selectedRole:"todos"});return true;
  },
  restoreRecovery: contents => {
    const document=parseNativeText(contents);
    if(!recovery.checkpoint(get().document,"Antes da recuperação"))return false;
    recovery.prepareRestore();
    set({...recovered(document),selectedEmployeeId:undefined,selectedRole:"todos"});return true;
  },
  retryStorage: () => {
    const state=get();return recovery.retrySave({version:2,state:{document:state.document,theme:state.theme,viewMode:state.viewMode}});
  },
  setPlanningPeriod: planningPeriod => {
    const error = periodError(planningPeriod); if (error) throw new Error(error);
    set(state => presentDocument({...state.document, planningPeriod, updatedAt:nowInstant()}));
  },
  clearAll: () => set({...presentDocument(emptyDocument()), selectedEmployeeId:undefined, selectedRole:"todos", viewMode:"timeline"}),
  setAnalysis:analysis => set({analysis}),
  applyGeneratedSchedule: (submitted, result) => set(state => {
    if (state.document !== submitted) return {};
    result = normalizeResultTimes(result,submitted.company.timeZone);
    const failures = result.conflicts.filter(c => c.code === "solverInfeasible" || c.code === "solverTimeout");
    if (failures.length) {
      const analysis = analyzeDocument(submitted);
      return {analysis:{...analysis,conflicts:[...analysis.conflicts,...failures]},solverStatus:"invalid"};
    }
    // Preserve outside objects verbatim. Re-running legacy normalization here can edit history.
    const assignments = replacePeriodAssignments(submitted, result.assignments).map(a => {
      if (submitted.assignments.includes(a)) return a;
      const employee = submitted.employees.find(e => e.id === a.employeeId);
      return {...a,roleId:employee?.roleId};
    });
    if(!recovery.checkpoint(submitted,"Antes da geração"))return {solverStatus:"idle"};
    const document = {...submitted,assignments,updatedAt:nowInstant()};
    return {document,analysis:{...result,assignments},solverStatus:result.conflicts.some(c => c.severity === "error") ? "invalid" : result.gaps.length ? "partial" : "optimized"};
  }),
  upsertEmployee:employee => set(state => ({...presentDocument({...state.document,updatedAt:nowInstant(),
    employees:[...state.document.employees.filter(e => e.id !== employee.id),employee],
    assignments:state.document.assignments.map(a => a.employeeId === employee.id ? {...a,role:employee.role} : a)
  }),selectedEmployeeId:undefined})),
  deleteEmployee:id => set(state => ({...presentDocument({...state.document,updatedAt:nowInstant(),
    employees:state.document.employees.filter(e => e.id !== id),assignments:state.document.assignments.filter(a => a.employeeId !== id)
  }),selectedEmployeeId:undefined})),
  moveAssignment:(id,start,end) => set(state => {
    const document = {...state.document,updatedAt:nowInstant(),assignments:state.document.assignments.map(a => a.id === id ? moveShift(a,start,end,state.document.company.timeZone) : a)};
    return {document,analysis:analyzeDocument(document),solverStatus:"idle"};
  }),
  upsertAssignment:assignment => set(state => presentDocument({...replaceAssignment(state.document,assignment),updatedAt:nowInstant()}))
}),{
  name:"escalalivre-state",
  version: 2,
  storage: recovery.storage,
  migrate: persisted => {
    const saved = persisted as Pick<ScheduleState, "document" | "theme" | "viewMode">;
    return {...saved, document:migrateDocument(saved.document).document};
  },
  partialize:state => ({document:state.document,theme:state.theme,viewMode:state.viewMode}),
  merge:(persisted,current) => {
    const first=!hydratedOnce;hydratedOnce=true;
    const saved=persisted as SavedSchedule | undefined;
    if(!saved) return first && recovery.getSnapshot().protected ? {...current,...presentDocument(emptyDocument())} : current;
    const document=structuredClone(validateNativeDocument(saved.document));
    if(document.company.name === "EscalaLivre Demo")document.company.name="Escala Livre";
    return {...current,theme:saved.theme,viewMode:saved.viewMode as ViewMode,...recovered(document)};
  }
}));
