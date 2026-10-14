import { documentSchema } from "./documentSchema";
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
    body: JSON.stringify({ document, ...planningPeriod(document) })
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
  if (file.size > 10 * 1024 * 1024) throw new Error("Arquivo maior que 10 MB.");
  const result = documentSchema.safeParse(JSON.parse(await file.text()));
  if (!result.success) throw new Error("Arquivo invalido ou versao nao suportada: " + result.error.issues[0].message);
  return result.data;
}

function documentRef() {
  return window.document;
}

export function planningPeriod(document: EscalaLivreDocument) {
  const first = document.assignments.map(a => a.start).sort()[0];
  const start = first ? new Date(first) : new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 0);
  const local = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  return { start: local(start), end: local(end) };
}
