import limits from "../../../shared/native-document-limits.json";
import { documentSchema } from "./documentSchema";
import type { EscalaLivreDocument } from "../types/schedule";

export const MAX_NATIVE_BYTES = limits.maxBytes;
export const nativeBytes = (text: string) => new TextEncoder().encode(text).byteLength;
export function assertNativeSize(text: string): void {
  if (nativeBytes(text) > MAX_NATIVE_BYTES) throw new Error("O arquivo nativo excede o limite de 1 MiB (1.048.576 bytes).");
}
export function validateNativeDocument(input: unknown): EscalaLivreDocument {
  const result = documentSchema.safeParse(input);
  if (!result.success) throw new Error("Documento inválido ou versão não suportada: "+result.error.issues[0].message);
  const canonical=documentSchema.safeParse(result.data);
  if(!canonical.success)throw new Error("Documento migrado inválido: "+canonical.error.issues[0].message);
  return canonical.data;
}
export function serializeNative(document: EscalaLivreDocument): string {
  const canonical = validateNativeDocument(document);
  let text = JSON.stringify(canonical, null, 2);
  if(nativeBytes(text)>MAX_NATIVE_BYTES)text=JSON.stringify(canonical);
  assertNativeSize(text);
  return text;
}
export function parseNativeText(text: string): EscalaLivreDocument {
  assertNativeSize(text);
  const document = validateNativeDocument(JSON.parse(text));
  return document;
}
export async function readNativeFile(file: Pick<File,"size"|"text">): Promise<EscalaLivreDocument> {
  if (file.size > MAX_NATIVE_BYTES) throw new Error("O arquivo nativo excede o limite de 1 MiB (1.048.576 bytes).");
  return parseNativeText(await file.text());
}
export function downloadText(text: string, filename: string, type="application/json"): void {
  const url=URL.createObjectURL(new Blob([text],{type}));
  try {
    const anchor=window.document.createElement("a"); anchor.href=url; anchor.download=filename;
    window.document.body.appendChild(anchor); anchor.click(); anchor.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  } catch (error) { URL.revokeObjectURL(url); throw error; }
}
