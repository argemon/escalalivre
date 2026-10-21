import { useState, useSyncExternalStore } from "react";
import { recovery } from "../lib/recoveryStorage";
import { downloadText, serializeNative } from "../lib/nativeDocument";
import { useScheduleStore } from "../store/scheduleStore";
import { Badge, Button } from "./ui";

export function StorageBadge() {
  const status=useSyncExternalStore(recovery.subscribe,recovery.getSnapshot);
  return <Badge className={"storage-status " + (status.phase!=="saved" && status.phase!=="ready" ? "storage-warning text-amber-600" : "")} role="status">{status.phase==="saved" ? "Salvo neste dispositivo" : status.phase==="ready" ? "Dados nesta sessão" : "Atenção: dados sem salvar · veja Dados e opções"}</Badge>;
}
export function RecoveryPanel() {
  const status=useSyncExternalStore(recovery.subscribe,recovery.getSnapshot);
  const {document,restoreRecovery,retryStorage}=useScheduleStore();
  const [error,setError]=useState("");
  const action=(fn:()=>void)=>{try {fn();setError("");}catch(e){setError(e instanceof Error?e.message:"Não foi possível concluir a recuperação.");}};
  const problem=status.phase!=="saved" && status.phase!=="ready";
  return <details className="border-t border-border px-5 py-2 text-sm" open={problem || undefined}>
    <summary className="cursor-pointer">{problem ? "Atenção ao armazenamento · Recuperar dados" : "Cópias e recuperação de dados"}{status.copies.length ? " ("+status.copies.length+")" : ""}</summary>
    {status.message && <p role="status" className="mt-2">{status.message}</p>}
    <div className="my-2 flex flex-wrap gap-2">
      <Button type="button" className="h-8 text-xs" onClick={()=>action(()=>{downloadText(serializeNative(document),"escala-recuperada.escalalivre");})}>Exportar planejamento disponível</Button>
      <Button type="button" className="h-8 text-xs" onClick={()=>action(()=>{downloadText(JSON.stringify(document,null,2),"dados-disponiveis.json");})}>Baixar dados brutos disponíveis</Button>
      {problem && <Button type="button" className="h-8 text-xs" onClick={()=>action(()=>{retryStorage();})}>Tentar salvar novamente</Button>}
    </div>
    {status.copies.length===0 && <p className="text-xs text-muted-foreground">As cópias são criadas antes de importar ou aplicar uma geração que substitui turnos.</p>}
    <ul className="max-h-44 space-y-2 overflow-auto">{status.copies.map(copy=><li key={copy.id} className="flex flex-wrap items-center gap-2 rounded border border-border p-2">
      <span className="mr-auto">{copy.reason} · {new Date(copy.createdAt).toLocaleString("pt-BR")} · {copy.durable ? "Cópia no navegador" : copy.downloaded ? "Cópia baixada" : "Disponível nesta sessão"}</span>
      <Button type="button" className="h-8 text-xs" onClick={()=>action(()=>{downloadText(copy.contents,copy.native?"copia-recuperacao.escalalivre":"conteudo-original.json");recovery.markDownloaded(copy.id);})}>Baixar cópia</Button>
      {copy.native && <Button type="button" className="h-8 text-xs" onClick={()=>action(()=>{restoreRecovery(copy.contents);})}>Restaurar cópia</Button>}
    </li>)}</ul>
    {error && <p role="alert" className="mt-2 text-red-600">{error}</p>}
  </details>;
}
