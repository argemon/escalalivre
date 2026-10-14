import { Download, FileUp, Moon, RotateCcw, Sun, Wifi } from "lucide-react";
import { sampleDocument } from "../data/sample";
import { exportNative, importNative } from "../lib/api";
import { useScheduleStore, type SolverStatus, type ViewMode } from "../store/scheduleStore";
import { Badge, Button, IconButton } from "./ui";

const viewModes: { mode: ViewMode; label: string; description: string }[] = [
  { mode: "timeline", label: "Escala do dia", description: "Veja os horários de cada pessoa no dia selecionado. Clique em um nome para editar seu cadastro." }, { mode: "week", label: "Escala semanal", description: "Veja os turnos da semana no calendário. Arraste um turno para mudar seu horário ou clique nele para abrir o cadastro da pessoa." },
  { mode: "month", label: "Escala mensal", description: "Veja os turnos distribuídos ao longo do mês. Clique em um turno para abrir o cadastro da pessoa." }, { mode: "coverage", label: "Pessoas por horário", description: "Confira quantas pessoas estão escaladas e quantas são necessárias em cada período e função." },
  { mode: "heatmap", label: "Onde faltam pessoas", description: "Identifique os dias e as funções que precisam de mais pessoas na escala." }, { mode: "solver", label: "Assistente de escala", description: "Gere uma escala otimizada e revise os conflitos, as faltas de pessoas e as sugestões de ajuste." }
];

const solverLabels: Record<SolverStatus, string> = {
  idle: "Pronto",
  calculating: "Calculando",
  optimized: "Otimizado",
  partial: "Precisa de ajustes",
  invalid: "Revisar escala"
};

export function GlobalHeader() {
  const { document, analysis, theme, setTheme, viewMode, setViewMode, solverStatus, setDocument, setSelectedEmployeeId } = useScheduleStore();

  return (
    <header className="app-header shrink-0 border-b border-border bg-card"><div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
      <div className="flex min-w-0 items-center gap-4">
        <div>
          <p className="text-xs uppercase text-muted-foreground">EscalaLivre · Gestão de equipes</p>
          <h1 className="truncate text-lg font-semibold">{document.company.name}</h1>
        </div>
        <div className="hidden items-center gap-2 xl:flex">
          <Badge>{document.company.opensAt.slice(0, 5)}-{document.company.closesAt.slice(0, 5)}</Badge>
          <Badge>{Math.round(analysis.coverageScore * 100)}% cobertura</Badge>
          <Badge>{solverLabels[solverStatus]}</Badge>
        </div>
      </div>



      <div className="flex items-center gap-2">
        <Badge className="hidden md:inline-flex">Salvo neste dispositivo</Badge>
        <Badge className="hidden gap-1 md:inline-flex"><Wifi className="size-3" /> Disponível offline</Badge>
        <Button className="hidden bg-card text-foreground dark:bg-card dark:text-foreground md:inline-flex" onClick={() => exportNative(document)}>
          <Download className="size-4" />
          Exportar
        </Button>
        <label className="hidden h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium md:inline-flex">
          <FileUp className="size-4" />
          Importar
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
        <Button onClick={() => setSelectedEmployeeId("new")}>Adicionar funcionário</Button>
        <IconButton title="Restaurar demonstração" onClick={() => { if (window.confirm("Substituir o planejamento atual pela demonstração? Exporte seus dados antes de continuar.")) setDocument(structuredClone(sampleDocument)); }}>
          <RotateCcw className="size-4" />
        </IconButton>
        <IconButton title={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </IconButton>
      </div>
      </div>
      <nav aria-label="Visualizações da escala" className="flex gap-1 overflow-x-auto border-t border-border px-5 py-2">
        {viewModes.map(({ mode, label, description }) => (
          <button
            key={mode}
            title={description}
            aria-describedby="view-description"
            aria-current={viewMode === mode ? "page" : undefined}
            className={`h-10 shrink-0 rounded-xl px-4 text-sm font-medium transition ${viewMode === mode ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            onClick={() => setViewMode(mode)}
          >
            {label}
          </button>
        ))}
      </nav>
      <p id="view-description" className="border-t border-border bg-background px-5 py-3 text-sm text-muted-foreground">{viewModes.find(item => item.mode === viewMode)?.description}</p>
    </header>
  );
}
