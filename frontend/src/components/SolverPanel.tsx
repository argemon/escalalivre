import { useMutation } from "@tanstack/react-query";
import { BrainCircuit, BriefcaseBusiness, CheckCircle2, CircleAlert, Loader2, Wand2 } from "lucide-react";
import type { ReactNode } from "react";
import { solveSchedule } from "../lib/api";
import { useScheduleStore } from "../store/scheduleStore";
import { Badge, Button, Panel } from "./ui";

export function SolverPanel() {
  const { document, analysis, setAnalysis, setDocument, solverStatus, setSolverStatus } = useScheduleStore();
  const mutation = useMutation({
    mutationFn: solveSchedule,
    onMutate: () => setSolverStatus("calculating"),
    onSuccess: (result) => {
      setAnalysis(result);
      setDocument({ ...document, assignments: result.assignments, updatedAt: new Date().toISOString() });
      setSolverStatus(result.conflicts.some((item) => item.severity === "error") ? "invalid" : result.gaps.length > 0 ? "partial" : "optimized");
    },
    onError: () => setSolverStatus("invalid")
  });

  const hardViolations = analysis.conflicts.filter((item) => item.severity === "error").length;
  const softViolations = analysis.conflicts.filter((item) => item.severity !== "error").length + analysis.gaps.length;

  return (
    <Panel className="flex h-full min-h-0 w-full flex-col border-l">
      <header className="border-b border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Operational intelligence</p>
            <h2 className="text-lg font-semibold">Solver engine</h2>
          </div>
          <Badge>{solverStatus}</Badge>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
        <section className="rounded-md border border-border bg-background p-4">
          <div className="flex items-center justify-between">
            <BrainCircuit className="size-5 text-primary" />
            {mutation.isPending && <Loader2 className="size-4 animate-spin text-primary" />}
          </div>
          <p className="mt-3 text-3xl font-semibold">{Math.round(analysis.coverageScore * 100)}%</p>
          <p className="text-sm text-muted-foreground">score de cobertura operacional</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Metric label="Hard violations" value={String(hardViolations)} tone={hardViolations > 0 ? "bad" : "good"} />
            <Metric label="Soft violations" value={String(softViolations)} tone={softViolations > 0 ? "warn" : "good"} />
          </div>
        </section>

        <Button className="w-full" onClick={() => mutation.mutate(document)} disabled={mutation.isPending}>
          <Wand2 className="size-4" />
          {mutation.isPending ? "Calculando plano otimo" : "Otimizar operacao"}
        </Button>

        <section className="space-y-2">
          <Title icon={<CircleAlert className="size-4" />} text="Conflitos e buracos" />
          {analysis.gaps.map((gap) => (
            <article key={`${gap.role}-${gap.start}`} className="rounded-md border border-red-500/30 bg-red-500/10 p-3">
              <p className="text-sm font-semibold">Falta {gap.missingEmployees} {gap.role}</p>
              <p className="text-xs text-muted-foreground">{new Date(gap.start).toLocaleString()} - {new Date(gap.end).toLocaleTimeString()}</p>
            </article>
          ))}
          {analysis.conflicts.map((conflict) => (
            <article key={`${conflict.code}-${conflict.start}`} className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-sm font-semibold">{conflict.code}</p>
              <p className="text-xs text-muted-foreground">{conflict.message}</p>
            </article>
          ))}
        </section>

        <section className="space-y-2">
          <Title icon={<CheckCircle2 className="size-4" />} text="Explicabilidade" />
          {analysis.decisions.slice(0, 3).map((decision) => (
            <article key={decision.assignmentId} className="rounded-md border border-border bg-background p-3 text-sm">
              <p className="font-medium">{decision.reason}</p>
              <div className="mt-2 space-y-1 text-muted-foreground">
                {decision.factors.map((factor) => <p key={factor}>- {factor}</p>)}
              </div>
            </article>
          ))}
          {analysis.optimizationSuggestions.map((suggestion) => (
            <article key={`${suggestion.code}-${suggestion.start}`} className="rounded-md border border-sky-500/30 bg-sky-500/10 p-3 text-sm">
              <p className="font-medium">{suggestion.message}</p>
              <p className="mt-2 text-muted-foreground">{suggestion.impact}</p>
            </article>
          ))}
        </section>

        <section className="space-y-2">
          <Title icon={<BriefcaseBusiness className="size-4" />} text="Contratacao" />
          {analysis.hiringSuggestions.map((suggestion) => (
            <article key={suggestion.role} className="rounded-md border border-border bg-background p-3">
              <p className="text-sm font-semibold">1 {suggestion.role} parcial</p>
              <p className="mt-1 text-xs text-muted-foreground">{suggestion.weeklyHours}h semanais - janelas criticas detectadas</p>
              <p className="mt-2 text-sm">{suggestion.rationale}</p>
            </article>
          ))}
        </section>
      </div>
    </Panel>
  );
}

function Title({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {icon}
      {text}
    </h3>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "good" | "warn" | "bad" }) {
  const color = tone === "good" ? "text-emerald-400" : tone === "warn" ? "text-amber-400" : "text-red-400";
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${color}`}>{value}</p>
    </div>
  );
}
