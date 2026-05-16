import { create } from "zustand";
import { persist } from "zustand/middleware";
import { sampleAnalysis, sampleDocument } from "../data/sample";
import type { EscalaLivreDocument, ScheduleResult, ShiftAssignment } from "../types/schedule";

type Theme = "light" | "dark";

type ScheduleState = {
  document: EscalaLivreDocument;
  analysis: ScheduleResult;
  theme: Theme;
  selectedRole: string;
  setTheme: (theme: Theme) => void;
  setSelectedRole: (role: string) => void;
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
      selectedRole: "todos",
      setTheme: (theme) => set({ theme }),
      setSelectedRole: (selectedRole) => set({ selectedRole }),
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
