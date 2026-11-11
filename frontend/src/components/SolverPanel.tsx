import { OperationalSummary } from "./OperationalSummary";
import { WorkloadSummaryCard } from "./WorkloadSummaryCard";
import { solverLabels, solverDescriptions } from "../lib/solverStatus";
import { groupDecisions } from "../lib/decisionGroups";
import { civilDateTime } from "../lib/dateTime";
import { HiringSuggestionCard } from "./HiringSuggestionCard";
import { useGenerationStore } from "../store/generationStore";
import { GenerationProgress } from "./GenerationProgress";
import { BrainCircuit, BriefcaseBusiness, CheckCircle2, Loader2, Wand2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useScheduleStore } from "../store/scheduleStore";
import { Badge, Button, Panel } from "./ui";

export function SolverPanel() {
  const { document, analysis, solverStatus } = useScheduleStore();
  const { active, start, proposal, message, confirmProposal, rejectProposal } = useGenerationStore();
  const [rangeStart,setRangeStart]=useState(document.planningPeriod.start),[rangeEnd,setRangeEnd]=useState(document.planningPeriod.end);

  const hardViolations = analysis.conflicts.filter((item) => item.severity === "error").length;
  const softViolations = analysis.conflicts.filter((item) => item.severity !== "error").length + analysis.gaps.length;
  const decisionGroups = groupDecisions(analysis.decisions);
  const assignments = new Map(analysis.assignments.map(assignment => [assignment.id, assignment]));
  const formatShiftTime = (value: string) => {
    const [date, time] = civilDateTime(value, document.company.timeZone).split("T");
    return `${date.split("-").reverse().join("/")} às ${time.endsWith(":00") ? time.slice(0, 5) : time}`;
  };

  return (
    <Panel className="flex h-full min-h-0 w-full flex-col border-l">
      <header className="border-b border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Ajuda para planejar melhor</p>
            <h2 className="text-lg font-semibold">Assistente de escala</h2>
          </div>
          <Badge>{solverLabels[solverStatus]}</Badge>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
        {solverDescriptions[solverStatus] && <p role="status" className="text-xs text-muted-foreground">{solverDescriptions[solverStatus]}</p>}
        <section className="rounded-md border border-border bg-background p-4">
          <div className="flex items-center justify-between">
            <BrainCircuit className="size-5 text-primary" />
            {active && <Loader2 className="size-4 animate-spin text-primary" />}
          </div>
          <p className="mt-3 text-3xl font-semibold">{Math.round(analysis.coverageScore * 100)}%</p>
          <p className="text-sm text-muted-foreground">da cobertura necessária atendida</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Metric label="Conflitos" value={String(hardViolations)} tone={hardViolations > 0 ? "bad" : "good"} />
            <Metric label="Pontos de atenção" value={String(softViolations)} tone={softViolations > 0 ? "warn" : "good"} />
          </div>
        </section>

        <div className="flex gap-2"><label>Gerar desde<input type="date" min={document.planningPeriod.start} max={document.planningPeriod.end} value={rangeStart} onChange={e=>setRangeStart(e.target.value)}/></label><label>Gerar até<input type="date" min={document.planningPeriod.start} max={document.planningPeriod.end} value={rangeEnd} onChange={e=>setRangeEnd(e.target.value)}/></label></div>
        <Button className="w-full" onClick={() => void start({start:rangeStart,end:rangeEnd})} disabled={active || !document.employees.length || !document.company.coverage.some(r => r.minimumEmployees > 0)}>
          <Wand2 className="size-4" />
          {active ? "Preparando sua escala…" : "Gerar escala"}
        </Button>

        {message&&<p role="status">{message}</p>}
        {proposal&&<section aria-label="Proposta de geração" className="space-y-2 rounded border border-primary p-3"><h3>Conferir proposta sem alterar o planejamento</h3><p>Recorte: {proposal.range.start} a {proposal.range.end}. Cobertura do planejamento: {Math.round(analysis.coverageScore*100)}% → {Math.round(proposal.preview.analysis.coverageScore*100)}%. Conflitos: {proposal.preview.analysis.conflicts.filter(c=>c.severity==="error").length}.</p>{(["added","changed","removed"]as const).map(k=><details key={k}><summary>{k==="added"?"Inclusões":k==="changed"?"Alterações":"Remoções"}: {proposal.preview.changes[k].length}</summary>{proposal.preview.changes[k].slice(0,30).map(a=><p className="text-xs" key={a.id}>{document.employees.find(e=>e.id===a.employeeId)?.name} · {a.role} · {a.start}–{a.end}</p>)}{proposal.preview.changes[k].length>30&&<p>Mais {proposal.preview.changes[k].length-30} turnos nesta categoria.</p>}</details>)}{proposal.preview.analysis.conflicts.slice(0,30).map((c,i)=><p className="text-xs" key={i}>{c.message}</p>)}<Button type="button" onClick={confirmProposal}>Aplicar proposta de geração</Button><Button type="button" onClick={rejectProposal}>Rejeitar proposta</Button></section>}
        {analysis.workloads?.map(w=><WorkloadSummaryCard key={w.employeeId+w.weekStart} summary={w} name={document.employees.find(e=>e.id===w.employeeId)?.name} />)}
        <GenerationProgress />
        <p className="text-xs text-muted-foreground">A proposta de geração substitui os turnos não fixados que começam no recorte escolhido, dentro de {document.planningPeriod.start.split("-").reverse().join("/")} a {document.planningPeriod.end.split("-").reverse().join("/")}, inclusive os que terminam no dia seguinte. Os demais turnos e todos os fixados serão preservados. A aplicação só ocorre após conferir e confirmar a proposta.</p>
        {(!document.employees.length || !document.company.coverage.some(r => r.minimumEmployees > 0)) && <p className="text-sm text-muted-foreground">Para gerar a escala, cadastre funcionários e ao menos uma regra de cobertura com quantidade maior que zero.</p>}
        <OperationalSummary />

        <section className="space-y-2">
          <Title icon={<CheckCircle2 className="size-4" />} text="Por que esta escala?" />
          {decisionGroups.map(group => (
            <article key={group.employeeId} className="rounded-md border border-border bg-background p-3 text-sm">
              <h4 className="font-semibold">{document.employees.find(employee => employee.id === group.employeeId)?.name ?? "Funcionário"}</h4>
              <p className="text-xs text-muted-foreground">{group.shifts.length} {group.shifts.length === 1 ? "turno explicado" : "turnos explicados"}</p>
              {group.reasons.map(reason => <p key={reason} className="mt-2">{reason}</p>)}
              {group.commonFactors.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                {group.commonFactors.map(factor => <li key={factor}>{factor}</li>)}
              </ul>}
              {group.shifts.some(shift => shift.factors.some(factor => !group.commonFactors.includes(factor))) && <details className="mt-3">
                <summary className="cursor-pointer text-primary">Ver diferenças por turno</summary>
                <ul className="mt-2 space-y-3">
                  {group.shifts.map(shift => {
                    const factors = shift.factors.filter(factor => !group.commonFactors.includes(factor));
                    if (!factors.length) return null;
                    const assignment = assignments.get(shift.assignmentId);
                    return <li key={shift.assignmentId}>
                      <p className="font-medium">{assignment ? `${formatShiftTime(assignment.start)} até ${formatShiftTime(assignment.end)}` : "Turno sem data disponível"}</p>
                      <ul className="list-disc pl-5 text-muted-foreground">{factors.map(factor => <li key={factor}>{factor}</li>)}</ul>
                    </li>;
                  })}
                </ul>
              </details>}
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
          <Title icon={<BriefcaseBusiness className="size-4" />} text="Sugestões para a equipe" />
          {analysis.hiringSuggestions.map(suggestion=><HiringSuggestionCard key={suggestion.role} suggestion={suggestion} />)}
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
