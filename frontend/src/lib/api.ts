import { normalizeDocumentTimes, normalizeResultTimes } from "./dateTime";
import { downloadText, readNativeFile, serializeNative } from "./nativeDocument";
export { serializeNative } from "./nativeDocument";
import type { EscalaLivreDocument, ScheduleResult } from "../types/schedule";

const API_URL = (import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:5003" : "")).replace(/\/$/, "");
export { planningPeriod } from "./analysis";
import { planningPeriod } from "./analysis";

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  errors: { code: string; message: string; target?: string }[];
  warnings: { code: string; message: string; target?: string }[];
  metadata: Record<string, unknown>;
};

export async function solveSchedule(document: EscalaLivreDocument): Promise<ScheduleResult> {
  document = normalizeDocumentTimes(document);
  let response: Response;
  try {
    response = await fetch(API_URL + "/solve", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document, ...planningPeriod(document) }), signal: AbortSignal.timeout(20000)
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError")
      throw new Error("O servidor demorou para responder. Aguarde e tente novamente.");
    throw new Error("Não foi possível conectar ao serviço de escalas. Tente novamente em alguns instantes.");
  }
  const retry = Number(response.headers.get("Retry-After"));
  const wait = Number.isFinite(retry) && retry > 0 ? Math.ceil(retry) + " segundos" : "alguns segundos";
  if (response.status === 429 || response.status === 503)
    throw new Error("O serviço está ocupado ou o limite de solicitações foi atingido. Aguarde " + wait + " e tente novamente.");
  if (response.status === 504)
    throw new Error("O cálculo atingiu o tempo limite. Reduza o período ou as regras e tente novamente.");
  if (response.status === 413) throw new Error("O planejamento é maior que o limite de 2 MB.");
  let envelope: ApiEnvelope<ScheduleResult>;
  try { envelope = await response.json(); }
  catch { throw new Error("O serviço está temporariamente indisponível. Tente novamente em alguns instantes."); }
  if (!response.ok || !envelope.success || !envelope.data) {
    throw new Error(envelope.errors?.map(error => error.message).join(", ") || "Não foi possível gerar a escala (HTTP " + response.status + ").");
  }

  return normalizeResultTimes(envelope.data,document.company?.timeZone);
}

export function exportNative(document: EscalaLivreDocument) {
  downloadText(serializeNative(document), "escala.escalalivre");
}

export async function importNative(file: File): Promise<EscalaLivreDocument> {
  return readNativeFile(file);
}
