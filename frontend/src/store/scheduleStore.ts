import { closePublication,selectPublication,retainPublications,freezePublications } from "../lib/publications";
import { generationProposal } from "../lib/generationProposal";
import { PlanningHistory } from "../lib/planningHistory";
import { confirmPlanning, type PlanningPreview } from "../lib/planningEdits";
import { confirmEmployment } from "../lib/employmentCommands";
import { activeOn } from "../lib/policies/employment";
import { confirmTeamPreview, type TeamPreview } from "../lib/teamOperations";

import { generationStatus, type SolverStatus } from "../lib/solverStatus";
export type { SolverStatus } from "../lib/solverStatus";
import { migrateDocument, normalizeDocument, replaceAssignment } from "../lib/documentLifecycle";
import { recovery, parseRecoveryDocument, type SavedSchedule } from "../lib/recoveryStorage";
import { validateNativeDocument } from "../lib/nativeDocument";
import { nowInstant, normalizeResultTimes, moveShift } from "../lib/dateTime";

import { periodError, type PlanningPeriod } from "../lib/planningPeriod";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { sampleDocument, emptyDocument } from "../data/sample";
import { analyzeDocument } from "../lib/analysis";
import type { Employee, EscalaLivreDocument, ScheduleResult, ShiftAssignment } from "../types/schedule";

type Theme = "light" | "dark";
export type ViewMode = "timeline" | "week" | "month" | "heatmap" | "coverage" | "solver";
type ScheduleState = {
  closePublication:(acknowledged:string[])=>void;
  selectPublication:(id:string)=>void;
  planningFocus?:{date:string;employeeId?:string};
  focusPlanning:(date:string,employeeId?:string)=>void;
  undoCount:number; redoCount:number; undo:()=>void; redo:()=>void;
  selectedShift?:{id?:string;employeeId:string;date:string;draft?:ShiftAssignment};
  selectShift:(selection:ScheduleState["selectedShift"])=>void;
  applyPlanningPreview:(preview:PlanningPreview,allowDraft:boolean)=>void;
  document: EscalaLivreDocument; analysis: ScheduleResult; theme: Theme; viewMode: ViewMode;
  solverStatus: SolverStatus; selectedRole: string; selectedEmployeeId?: string;
  applyEmploymentPreview: (preview: TeamPreview) => void;
  applyTeamPreview: (preview: TeamPreview) => void;
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
  applyGeneratedSchedule: (submitted: EscalaLivreDocument, result: ScheduleResult, range?:PlanningPeriod) => void;
  moveAssignment: (id: string, start: string, end: string) => void;
  upsertAssignment: (assignment: ShiftAssignment) => void;
};
// Edits and hydration recompute analysis without silently rewriting any shift.
const presentDocument=(input:EscalaLivreDocument)=>{
  const document=freezePublications(normalizeDocument(input));
  return {document,analysis:analyzeDocument(document),solverStatus:"idle" as const};
};
const recovered=(input:EscalaLivreDocument)=>presentDocument(validateNativeDocument(input));
let hydratedOnce = false;
export const useScheduleStore = create<ScheduleState>()(persist((rawSet, get) => {
 const history=new PlanningHistory();
 const set:typeof rawSet=partial=>rawSet(state=>{const next=typeof partial==="function"?partial(state):partial;if(next.document){next.document=freezePublications(retainPublications(state.document,next.document));history.record(state.document,next.document);}return {...next,...(next.document&&next.document.id!==state.document.id?{planningFocus:undefined}:{}),undoCount:history.past.length,redoCount:history.future.length};});
 return ({
  closePublication:acknowledged=>{const state=get();const document=closePublication(state.document,acknowledged);if(!recovery.checkpoint(state.document,"Antes do fechamento"))throw Error("Não foi possível guardar a recuperação. Libere espaço e tente novamente.");rawSet(presentDocument(document));},
  selectPublication:id=>rawSet(presentDocument(selectPublication(get().document,id))),
  focusPlanning:(date,employeeId)=>set({planningFocus:{date,employeeId},viewMode:"timeline",selectedEmployeeId:undefined,selectedShift:undefined}),
  undoCount:0,redoCount:0,
  undo:()=>{const current=get().document,restored=history.undo(current),document=restored?retainPublications(current,restored):undefined;if(document)rawSet({...presentDocument(document),selectedShift:undefined,selectedEmployeeId:undefined,planningFocus:undefined,undoCount:history.past.length,redoCount:history.future.length});},
  redo:()=>{const current=get().document,restored=history.redo(current),document=restored?retainPublications(current,restored):undefined;if(document)rawSet({...presentDocument(document),selectedShift:undefined,selectedEmployeeId:undefined,planningFocus:undefined,undoCount:history.past.length,redoCount:history.future.length});},
  selectShift:selectedShift=>set({selectedShift,selectedEmployeeId:undefined}),
  applyPlanningPreview:(preview,allowDraft)=>set(state=>({...presentDocument({...confirmPlanning(state.document,preview,allowDraft),updatedAt:nowInstant()}),selectedShift:undefined,selectedEmployeeId:undefined})),
  ...presentDocument(migrateDocument(sampleDocument).document),theme:"light",viewMode:"timeline",selectedRole:"todos",
  setTheme: theme => set({theme}),setViewMode:viewMode => set({viewMode}),
  setSolverStatus:solverStatus => set({solverStatus}),setSelectedRole:selectedRole => set({selectedRole}),
  setSelectedEmployeeId:selectedEmployeeId => set({selectedEmployeeId,selectedShift:undefined}),
  setDocument:document => set({...presentDocument(document),selectedEmployeeId:undefined,selectedShift:undefined}),
  importDocument: input => {
    const document = validateNativeDocument(input);
    // Prepare and validate before creating the checkpoint; a rejected import never replaces data.
    const next = recovered(document);
    if(!recovery.checkpoint(get().document,"Antes da importação"))return false;
    history.clear();rawSet({...next,selectedEmployeeId:undefined,selectedShift:undefined,planningFocus:undefined,selectedRole:"todos",undoCount:0,redoCount:0});return true;
  },
  restoreRecovery: contents => {
    const document=parseRecoveryDocument(contents);
    if(!recovery.checkpoint(get().document,"Antes da recuperação"))return false;
    recovery.prepareRestore();
    history.clear();rawSet({...recovered(document),selectedEmployeeId:undefined,selectedShift:undefined,planningFocus:undefined,selectedRole:"todos",undoCount:0,redoCount:0});return true;
  },
  retryStorage: () => {
    const state=get();return recovery.retrySave({version:2,state:{document:state.document,theme:state.theme,viewMode:state.viewMode}});
  },
  setPlanningPeriod: planningPeriod => {
    const error = periodError(planningPeriod); if (error) throw new Error(error);
    set(state => presentDocument({...state.document, planningPeriod, updatedAt:nowInstant()}));
  },
  clearAll: () => set({...presentDocument(emptyDocument()), selectedEmployeeId:undefined, selectedShift:undefined, selectedRole:"todos", viewMode:"timeline"}),
  setAnalysis:analysis => set({analysis}),
  applyGeneratedSchedule: (submitted, result, range) => set(state => {
    if (state.document !== submitted) return {};
    result = normalizeResultTimes(result,submitted.company.timeZone);
    const failures = result.conflicts.filter(c => c.code === "solverInfeasible" || c.code === "solverTimeout" || c.code === "solverInvalid");
    if (failures.length || ["infeasible","timeout","invalid"].includes(result.optimization?.status??"")) {
      const analysis = analyzeDocument(submitted);
      return {analysis:{...analysis,optimization:result.optimization,conflicts:[...analysis.conflicts,...failures]},solverStatus:"invalid"};
    }
    const proposal=generationProposal(submitted,result,range);
    if(!recovery.checkpoint(submitted,"Antes da geração"))return {solverStatus:"idle"};
    const document={...proposal.document,updatedAt:nowInstant()};
    const analysis={...analyzeDocument(document),optimization:result.optimization,decisions:result.decisions,optimizationSuggestions:result.optimizationSuggestions};
    return {document,analysis,solverStatus:generationStatus(analysis)};
  }),
  applyEmploymentPreview:preview => set(state => ({...presentDocument({...confirmEmployment(state.document,preview),updatedAt:nowInstant()}),selectedEmployeeId:undefined})),
  applyTeamPreview:preview => set(state => presentDocument({...confirmTeamPreview(state.document,preview),updatedAt:nowInstant()})),
  upsertEmployee:employee => set(state => ({...presentDocument({...state.document,updatedAt:nowInstant(),
    employees:[...state.document.employees.filter(e => e.id !== employee.id),employee],
    assignments:state.document.assignments
  }),selectedEmployeeId:undefined})),
  deleteEmployee:id => set(state => ({...presentDocument({...state.document,updatedAt:nowInstant(),
    employees:state.document.employees.filter(e => e.id !== id),assignments:state.document.assignments.filter(a => a.employeeId !== id)
  }),selectedEmployeeId:undefined})),
  moveAssignment:(id,start,end) => set(state => {
    const previous=state.document.assignments.find(a=>a.id===id),employee=state.document.employees.find(e=>e.id===previous?.employeeId);
    if(employee && !activeOn(employee,start) && previous?.start.slice(0,10)!==start.slice(0,10))throw new Error("Pessoa inativa na data inicial do turno.");
    const document = {...state.document,updatedAt:nowInstant(),assignments:state.document.assignments.map(a => a.id === id ? moveShift(a,start,end,state.document.company.timeZone) : a)};
    return {document,analysis:analyzeDocument(document),solverStatus:"idle"};
  }),
  upsertAssignment:assignment => set(state => {
    const employee=state.document.employees.find(e=>e.id===assignment.employeeId);
    const existing=state.document.assignments.find(a=>a.id===assignment.id);
    if(!employee || ((!existing || existing.employeeId!==assignment.employeeId || existing.start.slice(0,10)!==assignment.start.slice(0,10)) && !activeOn(employee,assignment.start)))throw new Error("Pessoa inativa na data inicial do turno.");
    return presentDocument({...replaceAssignment(state.document,assignment),updatedAt:nowInstant()});
  })
});},{
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
