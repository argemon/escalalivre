import { create } from "zustand";
import { cancelQueuedSolve, solveQueued, type JobProgress } from "../lib/queuedSolve";
import { useScheduleStore } from "./scheduleStore";

type GenerationState = {
  active: boolean; cancelling: boolean; progress?: JobProgress; updatedAt: number; message?: string;
  start: () => Promise<void>; cancel: () => Promise<void>;
};

// Lives outside the panel so switching calendar tabs cannot duplicate or lose a job.
export const useGenerationStore = create<GenerationState>((set, get) => ({
  active: false, cancelling: false, updatedAt: 0,
  start: async () => {
    if (get().active) return;
    const submitted = useScheduleStore.getState().document;
    set({ active: true, cancelling: false, progress: undefined, message: undefined, updatedAt: Date.now() });
    useScheduleStore.getState().setSolverStatus("calculating");
    try {
      const result = await solveQueued(submitted, progress => set(progress.reconnecting ? { progress } : { progress, updatedAt: Date.now() }));
      const current = useScheduleStore.getState();
      if (result && current.document === submitted) {
        current.applyGeneratedSchedule(submitted, result);
        set({ message: undefined });
      }
      else {
        if (current.document === submitted) current.setSolverStatus("idle");
        set({ message: result ? "O planejamento mudou durante a espera. Gere novamente para usar os dados atuais." : "Geração cancelada. Seus turnos foram mantidos." });
      }
    } catch (error) {
      if (useScheduleStore.getState().document === submitted) useScheduleStore.getState().setSolverStatus("invalid");
      set({ message: error instanceof Error ? error.message : "Não foi possível gerar a escala." });
    } finally { set({ active: false, cancelling: false }); }
  },
  cancel: async () => {
    const id = get().progress?.id;
    if (!id || !get().active || get().cancelling) return;
    set({ cancelling: true, message: undefined });
    try { await cancelQueuedSolve(id); }
    catch {
      if (get().active) set({ cancelling: false, message: "Não foi possível confirmar o cancelamento. Estamos acompanhando seu pedido; tente cancelar novamente." });
    }
  }
}));
