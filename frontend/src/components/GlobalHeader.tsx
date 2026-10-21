import { RecoveryPanel, StorageBadge } from "./RecoveryPanel";
import { Download, FileUp, Moon, Trash2, Sun, Wifi, Printer, ChevronDown, HelpCircle, Sparkles } from "lucide-react";
import { PlanningPeriodEditor } from "./PlanningPeriodEditor";
import { Brand } from "./Brand";
import { PrintSchedule } from "./PrintSchedule";
import { useState } from "react";
import { exportNative, importNative } from "../lib/api";
import { useScheduleStore, type SolverStatus, type ViewMode } from "../store/scheduleStore";
import { Badge, Button, IconButton } from "./ui";

const viewModes: { mode: ViewMode; label: string; description: string }[] = [
  { mode: "timeline", label: "Escala do dia", description: "Veja os horários de cada pessoa no dia selecionado. Clique em um nome para editar seu cadastro." }, { mode: "week", label: "Escala semanal", description: "Veja os turnos e a disponibilidade de cada pessoa na semana. Clique em um nome para editar." },
  { mode: "month", label: "Escala mensal", description: "Veja os turnos salvos e as prévias estimadas do mês. Clique no número do dia para configurar feriados; clique em um turno para abrir o cadastro da pessoa." }, { mode: "coverage", label: "Pessoas por horário", description: "Confira quantas pessoas estão escaladas e quantas são necessárias em cada período e função." },
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
  const { document, analysis, theme, setTheme, viewMode, setViewMode, solverStatus, importDocument, clearAll } = useScheduleStore();

  const [clearing,setClearing] = useState(false);
  const [printing,setPrinting] = useState(false);
  const [confirmation,setConfirmation] = useState("");
  return (
    <header className="app-header shrink-0 border-b border-border bg-card"><div className="header-toolbar">
      <div className="header-identity">
        <div className="header-brand-company">
          <Brand className="brand-header" />
          <h1 className="header-company" title={document.company.name}>{document.company.name}</h1>
        </div>
        <div className="header-metrics">
          <Badge>{document.company.opensAt.slice(0, 5)}-{document.company.closesAt.slice(0, 5)}</Badge>
          <Badge>{Math.round(analysis.coverageScore * 100)}% cobertura</Badge>
          <Badge>{solverLabels[solverStatus]}</Badge>
        </div>
      </div>



      <div className="header-actions">
        <Button onClick={() => setPrinting(true)}><Printer className="size-4" />Imprimir</Button>
        <StorageBadge />
        <details className="header-tools" onKeyDown={e => {if(e.key === "Escape") {e.currentTarget.open=false;e.currentTarget.querySelector("summary")?.focus();}}}>
          <summary><ChevronDown className="size-4" /> Dados e opções</summary>
          <div className="header-tools-content">
        <p className="flex items-center gap-1 text-xs text-muted-foreground"><Wifi className="size-3" /> Disponível offline</p>
        <Button className="w-full bg-card text-foreground dark:bg-card dark:text-foreground" onClick={() => {try {exportNative(document);} catch(error) {window.alert(error instanceof Error ? error.message : "Não foi possível exportar. Use a recuperação para baixar os dados disponíveis.");}}}>
          <Download className="size-4" />
          Exportar
        </Button>
        <label className="flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium">
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
                  if (window.confirm("Abrir este arquivo e substituir o planejamento atual? Uma cópia recuperável será criada antes da substituição.")) importDocument(imported);
                } catch (error) {
                  window.alert(error instanceof Error ? error.message : "Nao foi possivel abrir o arquivo.");
                } finally {
                  event.target.value = "";
                }
              }
            }}
          />
        </label>

        <Button className="bg-card text-red-600 dark:bg-card dark:text-red-400" onClick={() => {setConfirmation("");setClearing(true);}}><Trash2 className="size-4" />Limpar tudo</Button>
        <RecoveryPanel />
          </div>
        </details>
        <IconButton title={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </IconButton>
      </div>
      </div>
      <PlanningPeriodEditor key={document.id+document.planningPeriod.start+document.planningPeriod.end} />
      {printing && <PrintSchedule onClose={() => setPrinting(false)} />}
      {clearing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onKeyDown={e => {if(e.key === "Escape") setClearing(false);}}>
        <form role="dialog" aria-modal="true" aria-labelledby="clear-title" className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-6 shadow-xl" onSubmit={e => {e.preventDefault();if(confirmation === "LIMPAR") {clearAll();setClearing(false);}}}>
          <h2 id="clear-title" className="text-xl font-semibold text-red-600">Apagar todos os dados?</h2>
          <p className="text-sm">Isso apaga a empresa configurada, funcionários, turnos e regras de cobertura salvos neste dispositivo. A ação não pode ser desfeita. Exporte uma cópia antes, se quiser guardar seus dados.</p>
          <label className="block text-sm">Digite <strong>LIMPAR</strong> para confirmar<input autoFocus value={confirmation} onChange={e => setConfirmation(e.target.value)} className="mt-2 w-full rounded-lg border border-border bg-background p-3" /></label>
          <div className="flex justify-end gap-2"><Button type="button" onClick={() => setClearing(false)}>Cancelar</Button><Button type="submit" disabled={confirmation !== "LIMPAR"} className="bg-red-600 dark:bg-red-600 dark:text-white">Apagar tudo</Button></div>
        </form>
      </div>}
      <nav aria-label="Visualizações da escala" className="header-view-nav">
        {viewModes.map(({ mode, label, description }) => (
          <button
            key={mode}
            title={description}
            aria-describedby="view-description"
            aria-current={viewMode === mode ? "page" : undefined}
            className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm transition ${mode === "solver" ? `border border-primary bg-primary font-semibold text-white shadow-sm hover:brightness-110 dark:text-slate-950 ${viewMode === mode ? "ring-2 ring-primary ring-offset-2 ring-offset-card" : ""}` : `font-medium ${viewMode === mode ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}`}
            onClick={() => setViewMode(mode)}
          >
            {mode === "solver" && <Sparkles className="size-4" aria-hidden="true" />}
            {label}
          </button>
        ))}
      </nav>
      <details className="header-view-help">
        <summary aria-label="Ajuda sobre esta visualização"><HelpCircle className="size-4" /> Ajuda</summary>
        <p id="view-description">{viewModes.find(item => item.mode === viewMode)?.description}</p>
      </details>
    </header>
  );
}
