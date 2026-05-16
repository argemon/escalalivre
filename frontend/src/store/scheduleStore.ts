import { create } from "zustand";
import { persist } from "zustand/middleware";
import { sampleAnalysis, sampleDocument } from "../data/sample";
import type { EscalaLivreDocument, ScheduleResult, ShiftAssignment } from "../types/schedule";

type Theme = "light" | "dark";
export type ViewMode = "timeline" | "week" | "month" | "heatmap" | "coverage" | "solver";
export type SolverStatus = "idle" | "calculating" | "optimized" | "partial" | "invalid";

type ScheduleState = {
  document: EscalaLivreDocument;
  analysis: ScheduleResult;
  theme: Theme;
  viewMode: ViewMode;
  solverStatus: SolverStatus;
  selectedRole: string;
  selectedEmployeeId?: string;
  setTheme: (theme: Theme) => void;
  setViewMode: (viewMode: ViewMode) => void;
  setSolverStatus: (solverStatus: SolverStatus) => void;
  setSelectedRole: (role: string) => void;
  setSelectedEmployeeId: (employeeId?: string) => void;
  setDocument: (document: EscalaLivreDocument) => void;
  setAnalysis: (analysis: ScheduleResult) => void;
  moveAssignment: (id: string, start: string, end: string) => void;
  upsertAssignment: (assignment: ShiftAssignment) => void;
};

export const useScheduleStore = create<ScheduleState>()(
  persist(
    (set) => ({
      document: sampleDocument,
      analysis: sampleAnalysis,
      theme: "dark",
      viewMode: "timeline",
      solverStatus: "optimized",
      selectedRole: "todos",
      setTheme: (theme) => set({ theme }),
      setViewMode: (viewMode) => set({ viewMode }),
      setSolverStatus: (solverStatus) => set({ solverStatus }),
      setSelectedRole: (selectedRole) => set({ selectedRole }),
      setSelectedEmployeeId: (selectedEmployeeId) => set({ selectedEmployeeId }),
      setDocument: (document) => set({ document }),
      setAnalysis: (analysis) => set({ analysis }),
      moveAssignment: (id, start, end) =>
        set((state) => ({
          document: {
            ...state.document,
            updatedAt: new Date().toISOString(),
            assignments: state.document.assignments.map((assignment) =>
              assignment.id === id ? { ...assignment, start, end } : assignment
            )
          }
        })),
      upsertAssignment: (assignment) =>
        set((state) => ({
          document: {
            ...state.document,
            updatedAt: new Date().toISOString(),
            assignments: [
              ...state.document.assignments.filter((item) => item.id !== assignment.id),
              assignment
            ]
          }
        }))
    }),
    { name: "escalalivre-state" }
  )
);
