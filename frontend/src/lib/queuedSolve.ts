import { normalizeDocumentTimes, normalizeResultTimes } from "./dateTime";
import { planningPeriod } from "./analysis";
import type { EscalaLivreDocument, ScheduleResult } from "../types/schedule";

const API_URL = (import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:5003" : "")).replace(/\/$/, "");
export type JobProgress = {
  id: string; state: "queued" | "processing" | "completed" | "cancelled" | "failed";
  position: number; jobsAhead: number; estimatedWaitSeconds: number; estimatedRunSeconds: number;
  elapsedSeconds: number; processingSeconds: number; workerTimeoutSeconds: number; pollAfterSeconds: number;
  result?: ScheduleResult; error?: string; reconnecting?: boolean;
};

class QueueResponseError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function request(path: string, options?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<JobProgress> {
  const response = await fetch(API_URL + path, { ...options, signal: AbortSignal.timeout(15000) });
  const envelope = await response.json().catch(() => null);
  if (!response.ok || !envelope?.success || !envelope.data) {
    const message = envelope?.errors?.map((e: { message: string }) => e.message).join(" ");
    throw new QueueResponseError(message || (response.status === 429
      ? "Muitas solicitações. Aguarde antes de tentar novamente."
      : "O serviço está temporariamente indisponível. Tente novamente em alguns instantes."), response.status);
  }
  return envelope.data;
}

export function cancelQueuedSolve(id: string) {
  return request("/solve/jobs/" + encodeURIComponent(id), { method: "DELETE" });
}

export async function solveQueued(document: EscalaLivreDocument, onProgress: (progress: JobProgress) => void): Promise<ScheduleResult | null> {
  const normalized = normalizeDocumentTimes(document);
  const body = JSON.stringify({ document: normalized, ...planningPeriod(normalized) });
  if (new TextEncoder().encode(body).byteLength > 2 * 1024 * 1024)
    throw new Error("O planejamento é maior que o limite de 2 MB.");
  let progress: JobProgress;
  try {
    progress = await request("/solve/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body });
  } catch (error) {
    if (error instanceof QueueResponseError) throw error;
    throw new Error("Não foi possível confirmar a entrada na fila. Aguarde alguns segundos antes de tentar novamente.");
  }
  for (;;) {
    onProgress(progress);
    if (progress.state === "completed") {
      if (!progress.result) throw new Error("O servidor não retornou a escala. Tente novamente.");
      return normalizeResultTimes(progress.result, document.company.timeZone);
    }
    if (progress.state === "cancelled") return null;
    if (progress.state === "failed") throw new Error(progress.error || "Não foi possível gerar a escala.");
    await new Promise(resolve => setTimeout(resolve, Math.max(3, progress.pollAfterSeconds) * 1000));
    try { progress = await request("/solve/jobs/" + encodeURIComponent(progress.id)); }
    catch (error) {
      if (error instanceof QueueResponseError && [400, 401, 403, 404, 410].includes(error.status)) throw error;
      // Poll failures never submit another job or lose the existing position.
      progress = { ...progress, reconnecting: true };
    }
  }
}

export function durationLabel(seconds: number): string {
  const rounded = Math.max(0, Math.ceil(seconds));
  return rounded < 60 ? `${rounded} s` : `${Math.floor(rounded / 60)} min ${rounded % 60} s`;
}
