import type { EscalaLivreDocument, ScheduleResult } from "../types/schedule";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  errors: { code: string; message: string; target?: string }[];
  warnings: { code: string; message: string; target?: string }[];
  metadata: Record<string, unknown>;
};

export async function solveSchedule(document: EscalaLivreDocument): Promise<ScheduleResult> {
  const response = await fetch(`${API_URL}/solve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document, start: "2026-05-18T00:00:00", end: "2026-05-24T23:59:59" })
  });

  if (!response.ok) {
    throw new Error("Nao foi possivel gerar a escala.");
  }

  const envelope = (await response.json()) as ApiEnvelope<ScheduleResult>;
  if (!envelope.success) {
    throw new Error(envelope.errors.map((error) => error.message).join(", "));
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
  return JSON.parse(await file.text()) as EscalaLivreDocument;
}

function documentRef() {
  return window.document;
}
