import { useEffect } from "react";
import { ScheduleCalendar } from "./components/ScheduleCalendar";
import { EmployeeDrawer } from "./components/EmployeeDrawer";
import { GlobalHeader } from "./components/GlobalHeader";
import { OperationalSidebar } from "./components/OperationalSidebar";
import { OperationalTimeline } from "./components/OperationalTimeline";
import { SolverPanel } from "./components/SolverPanel";
import { useScheduleStore } from "./store/scheduleStore";

export default function App() {
  const viewMode = useScheduleStore((state) => state.viewMode);
  const companyName = useScheduleStore(state => state.document.company.name);
  useEffect(() => { document.title = companyName === "Escala Livre" ? companyName : `${companyName} · Escala Livre`; }, [companyName]);
  const theme = useScheduleStore((state) => state.theme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <GlobalHeader />
      <div className="workspace-grid grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-auto p-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="workspace-sidebar min-h-0 overflow-auto rounded-2xl border border-border">
          <OperationalSidebar />
        </div>
        {viewMode === "week" || viewMode === "month" ? <ScheduleCalendar key={viewMode} /> : viewMode === "solver" ? <SolverPanel /> : <OperationalTimeline />}

      </div>
      <EmployeeDrawer />
    </div>
  );
}
