import { BriefcaseBusiness, Download, FileUp, Moon, Sparkles, Sun } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { exportNative, importNative, solveSchedule } from "../lib/api";
import { useScheduleStore } from "../store/scheduleStore";
import { Badge, Button, IconButton, Panel } from "./ui";

export function InsightPanel() {
  const { document, analysis, applyGeneratedSchedule, importDocument, theme, setTheme } = useScheduleStore();
  const mutation = useMutation({
    mutationFn: solveSchedule,
    onSuccess: (result, submitted) => applyGeneratedSchedule(submitted, result)
  });

  return (
    <Panel className="flex h-full min-h-0 w-full flex-col border-l">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div>
          <p className="text-xs uppercase text-muted-foreground">Solver</p>
          <h2 className="text-lg font-semibold">Painel inteligente</h2>
        </div>
        <IconButton title="Alternar tema" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </IconButton>
      </div>

      <div className="space-y-4 overflow-auto p-4">
        <section className="rounded-md border border-border bg-background p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Cobertura</span>
            <Badge>{Math.round(analysis.coverageScore * 100)}%</Badge>
          </div>
          <div className="mt-3 h-2 rounded bg-muted">
            <div className="h-2 rounded bg-emerald-500" style={{ width: `${analysis.coverageScore * 100}%` }} />
          </div>
        </section>

        <Button className="w-full" onClick={() => mutation.mutate(document)} disabled={mutation.isPending}>
          <Sparkles className="size-4" />
          {mutation.isPending ? "Gerando..." : "Gerar escala"}
        </Button>

        <div className="grid grid-cols-2 gap-2">
          <Button className="bg-card text-foreground dark:bg-card dark:text-foreground" onClick={() => {try {exportNative(document);} catch(error) {window.alert(error instanceof Error ? error.message : "Não foi possível exportar.");}}}>
            <Download className="size-4" />
            Exportar
          </Button>
          <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium">
            <FileUp className="size-4" />
            Importar
            <input
              type="file"
              accept=".escalalivre,application/json"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) {
                  try {importDocument(await importNative(file));} catch(error) {window.alert(error instanceof Error ? error.message : "Não foi possível importar.");} finally {event.target.value="";}
                }
              }}
            />
          </label>
        </div>

        <section>
          <h3 className="mb-2 text-sm font-semibold">Conflitos</h3>
          <div className="space-y-2">
            {analysis.conflicts.length === 0 && <p className="rounded-md bg-background p-3 text-sm text-muted-foreground">Nenhum conflito critico.</p>}
            {analysis.conflicts.map((issue) => (
              <p key={`${issue.code}-${issue.start}`} className="rounded-md border border-border bg-background p-3 text-sm">{issue.message}</p>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">Buracos operacionais</h3>
          <div className="space-y-2">
            {analysis.gaps.map((gap) => (
              <div key={`${gap.role}-${gap.start}`} className="rounded-md border border-border bg-background p-3">
                <p className="text-sm font-medium">Falta {gap.missingEmployees} {gap.role}</p>
                <p className="text-xs text-muted-foreground">{new Date(gap.start).toLocaleString()} - {new Date(gap.end).toLocaleTimeString()}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">Contratacao sugerida</h3>
          {analysis.hiringSuggestions.map((suggestion) => (
            <div key={suggestion.role} className="rounded-md border border-border bg-background p-3">
              <div className="flex items-center gap-2">
                <BriefcaseBusiness className="size-4 text-emerald-500" />
                <p className="text-sm font-medium">{suggestion.role} parcial</p>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{suggestion.weeklyHours}h semanais. {suggestion.rationale}</p>
            </div>
          ))}
        </section>
      </div>
    </Panel>
  );
}
