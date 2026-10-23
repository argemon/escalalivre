import { useEffect, useState } from "react";
import { Clock3, Loader2 } from "lucide-react";
import { durationLabel } from "../lib/queuedSolve";
import { useGenerationStore } from "../store/generationStore";
import { Button } from "./ui";

export function GenerationProgress() {
  const { active, cancelling, progress, updatedAt, message, cancel } = useGenerationStore();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  const extra = Math.max(0, Math.floor((now - updatedAt) / 1000));
  return <>
    {active && <section aria-label="Andamento da geração" className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div role="status" aria-live="polite" className="flex items-center gap-2 font-semibold">
        {progress?.state === "queued" ? <Clock3 className="size-4" /> : <Loader2 className="size-4 animate-spin" />}
        {cancelling ? "Cancelando geração…" : progress?.reconnecting ? "Reconectando ao gerador…" : progress?.state === "queued" ? `Você está na ${progress.position}ª posição da fila` : progress ? "Processando sua escala…" : "Entrando na fila…"}
      </div>
      {progress && <>
        <p className="text-sm">{progress.state === "queued"
          ? `${progress.jobsAhead} pedido(s) à frente. Espera estimada: cerca de ${durationLabel(progress.estimatedWaitSeconds)}.`
          : `Tempo estimado de processamento: cerca de ${durationLabel(progress.estimatedRunSeconds)}.`}</p>
        <p className="text-sm tabular-nums">Tempo decorrido: {durationLabel(progress.elapsedSeconds + extra)}</p>
        {progress.reconnecting && <p className="text-sm">A posição exibida é a última confirmada. Vamos atualizar automaticamente, sem enviar outro pedido.</p>}
        {progress.state === "processing" && progress.processingSeconds + extra > progress.estimatedRunSeconds && <p className="text-sm">Está demorando mais que a estimativa. Continuamos acompanhando o processamento.</p>}
      </>}
      <p className="text-xs text-muted-foreground">O EscalaLivre é gratuito e atende os pedidos em fila para economizar recursos. Os tempos são aproximados e podem mudar. Mantenha esta página aberta; você pode consultar outras abas do app durante a espera.</p>
      <Button type="button" onClick={() => void cancel()} disabled={!progress || cancelling} className="bg-card text-foreground dark:bg-card dark:text-foreground">{cancelling ? "Aguardando cancelamento…" : "Cancelar geração"}</Button>
    </section>}
    {message && <p role="status" className="text-sm text-foreground">{message}</p>}
  </>;
}
