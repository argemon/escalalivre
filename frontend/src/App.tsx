import { lazy, Suspense, useEffect } from "react";
import { EmployeeDrawer } from "./components/EmployeeDrawer";
import { GlobalHeader } from "./components/GlobalHeader";
import { OperationalSidebar } from "./components/OperationalSidebar";
import { OperationalTimeline } from "./components/OperationalTimeline";
import { SolverPanel } from "./components/SolverPanel";
import { useScheduleStore } from "./store/scheduleStore";

const ScheduleCalendar = lazy(() => import("./components/ScheduleCalendar").then(module => ({ default: module.ScheduleCalendar })));

export default function App() {
  const viewMode = useScheduleStore((state) => state.viewMode);
  const periodKey = useScheduleStore(state => state.document.id+state.document.planningPeriod.start+state.document.planningPeriod.end);
  const companyName = useScheduleStore(state => state.document.company.name);
  useEffect(() => { document.title = companyName === "Escala Livre" ? companyName : `${companyName} · Escala Livre`; }, [companyName]);
  const theme = useScheduleStore((state) => state.theme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <GlobalHeader />
      <div className="workspace-grid grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto p-3 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="workspace-sidebar min-h-0 overflow-auto rounded-2xl border border-border">
          <OperationalSidebar />
        </div>
        {viewMode === "week" || viewMode === "month" ? <Suspense fallback={<p role="status" className="p-4">Carregando calendário…</p>}><ScheduleCalendar key={viewMode+periodKey} /></Suspense> : viewMode === "solver" ? <SolverPanel /> : <OperationalTimeline />}

      </div>
      <EmployeeDrawer />
    </div>
  );
}
