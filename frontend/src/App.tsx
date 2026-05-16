import { useEffect } from "react";
import { EmployeeDrawer } from "./components/EmployeeDrawer";
import { GlobalHeader } from "./components/GlobalHeader";
import { OperationalSidebar } from "./components/OperationalSidebar";
import { OperationalTimeline } from "./components/OperationalTimeline";
import { SolverPanel } from "./components/SolverPanel";
import { useScheduleStore } from "./store/scheduleStore";

export default function App() {
  const theme = useScheduleStore((state) => state.theme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <GlobalHeader />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)_380px]">
        <div className="hidden min-h-0 lg:block">
          <OperationalSidebar />
        </div>
        <OperationalTimeline />
        <div className="hidden min-h-0 xl:block">
          <SolverPanel />
        </div>
      </div>
      <EmployeeDrawer />
    </div>
  );
}
