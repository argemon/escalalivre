import { useEffect } from "react";
import { EmployeeSidebar } from "./components/EmployeeSidebar";
import { InsightPanel } from "./components/InsightPanel";
import { ScheduleCalendar } from "./components/ScheduleCalendar";
import { useScheduleStore } from "./store/scheduleStore";

export default function App() {
  const theme = useScheduleStore((state) => state.theme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside className="hidden w-80 shrink-0 lg:block">
        <EmployeeSidebar />
      </aside>
      <ScheduleCalendar />
      <aside className="hidden w-96 shrink-0 xl:block">
        <InsightPanel />
      </aside>
      <div className="fixed inset-x-3 bottom-3 z-20 grid grid-cols-2 gap-2 xl:hidden">
        <div className="max-h-64 overflow-auto rounded-md border border-border shadow-lg lg:hidden">
          <EmployeeSidebar />
        </div>
        <div className="max-h-64 overflow-auto rounded-md border border-border shadow-lg">
          <InsightPanel />
        </div>
      </div>
    </div>
  );
}
