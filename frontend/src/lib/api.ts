import { documentSchema } from "./documentSchema";
import type { EscalaLivreDocument, ScheduleResult } from "../types/schedule";

const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:5003").replace(/\/$/, "");
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
  let response: Response;
  try {
    response = await fetch(API_URL + "/solve", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document, ...planningPeriod(document) }), signal: AbortSignal.timeout(20000)
    });
  } catch {
    throw new Error("Não foi possível conectar à API em " + API_URL + ". Inicie o backend local e tente novamente.");
  }
  const envelope = (await response.json()) as ApiEnvelope<ScheduleResult>;
  if (!response.ok || !envelope.success || !envelope.data) {
    throw new Error(envelope.errors?.map(error => error.message).join(", ") || "Não foi possível gerar a escala (HTTP " + response.status + ").");
  }

  return envelope.data;
}

export function exportNative(document: EscalaLivreDocument) {
  const blob = new Blob([JSON.stringify(document, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = documentRef().createElement("a");
  anchor.href = url;
  anchor.download = "escala.escalalivre";
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importNative(file: File): Promise<EscalaLivreDocument> {
  if (file.size > 10 * 1024 * 1024) throw new Error("Arquivo maior que 10 MB.");
  const result = documentSchema.safeParse(JSON.parse(await file.text()));
  if (!result.success) throw new Error("Arquivo invalido ou versao nao suportada: " + result.error.issues[0].message);
  return result.data;
}

function documentRef() {
  return window.document;
}
