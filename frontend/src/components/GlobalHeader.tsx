import { Download, FileUp, Moon, RotateCcw, Sun, Wifi } from "lucide-react";
import { exportNative, importNative } from "../lib/api";
import { useScheduleStore, type SolverStatus, type ViewMode } from "../store/scheduleStore";
import { Badge, Button, IconButton } from "./ui";

const viewModes: ViewMode[] = ["timeline", "week", "month", "heatmap", "coverage", "solver"];

const solverLabels: Record<SolverStatus, string> = {
  idle: "Pronto",
  calculating: "Calculando",
  optimized: "Otimizado",
  partial: "Parcialmente valido",
  invalid: "Invalido"
};

export function GlobalHeader() {
  const { document, analysis, theme, setTheme, viewMode, setViewMode, solverStatus, setDocument } = useScheduleStore();

  return (
    <header className="flex min-h-16 items-center justify-between gap-4 border-b border-border bg-card px-5">
      <div className="flex min-w-0 items-center gap-4">
        <div>
          <p className="text-xs uppercase text-muted-foreground">Workforce optimization</p>
          <h1 className="truncate text-lg font-semibold">{document.company.name}</h1>
        </div>
        <div className="hidden items-center gap-2 xl:flex">
          <Badge>{document.company.opensAt.slice(0, 5)}-{document.company.closesAt.slice(0, 5)}</Badge>
          <Badge>{Math.round(analysis.coverageScore * 100)}% cobertura</Badge>
          <Badge>{solverLabels[solverStatus]}</Badge>
        </div>
      </div>

      <nav className="hidden rounded-md border border-border bg-background p-1 lg:flex">
        {viewModes.map((mode) => (
          <button
            key={mode}
            className={`h-8 rounded px-3 text-xs font-medium capitalize ${viewMode === mode ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setViewMode(mode)}
          >
            {mode}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-2">
        <Badge className="hidden md:inline-flex">Autosave</Badge>
        <Badge className="hidden gap-1 md:inline-flex"><Wifi className="size-3" /> Offline-ready</Badge>
        <Button className="hidden bg-card text-foreground dark:bg-card dark:text-foreground md:inline-flex" onClick={() => exportNative(document)}>
          <Download className="size-4" />
          Export
        </Button>
        <label className="hidden h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium md:inline-flex">
          <FileUp className="size-4" />
          Import
          <input
            type="file"
            accept=".escalalivre,application/json"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) {
                try {
                  const imported = await importNative(file);
                  if (window.confirm("Abrir este arquivo e substituir o planejamento atual? Salve o atual antes de continuar.")) setDocument(imported);
                } catch (error) {
                  window.alert(error instanceof Error ? error.message : "Nao foi possivel abrir o arquivo.");
                } finally {
                  event.target.value = "";
                }
              }
            }}
          />
        </label>
        <IconButton title="Restore session">
          <RotateCcw className="size-4" />
        </IconButton>
        <IconButton title="Tema" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </IconButton>
      </div>
    </header>
  );
}
