import { AlertTriangle, Filter, Search } from "lucide-react";
import { Badge, IconButton, Panel } from "./ui";
import { useScheduleStore } from "../store/scheduleStore";

export function EmployeeSidebar() {
  const { document, analysis, selectedRole, setSelectedRole } = useScheduleStore();
  const roles = ["todos", ...Array.from(new Set(document.employees.map((employee) => employee.role)))];

  return (
    <Panel className="flex h-full min-h-0 w-full flex-col border-r">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div>
          <p className="text-xs uppercase text-muted-foreground">Equipe</p>
          <h2 className="text-lg font-semibold">Funcionarios</h2>
        </div>
        <IconButton title="Filtros">
          <Filter className="size-4" />
        </IconButton>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
          <Search className="size-4 text-muted-foreground" />
          <input className="w-full bg-transparent text-sm outline-none" placeholder="Buscar pessoa ou funcao" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {roles.map((role) => (
            <button
              key={role}
              onClick={() => setSelectedRole(role)}
              className={`rounded px-2 py-1 text-xs ring-1 ring-border ${selectedRole === role ? "bg-foreground text-background" : "bg-muted"}`}
            >
              {role}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-auto px-4 pb-4">
        {document.employees
          .filter((employee) => selectedRole === "todos" || employee.role === selectedRole)
          .map((employee) => {
            const hasGap = analysis.gaps.some((gap) => gap.role === employee.role);
            return (
              <article key={employee.id} className="rounded-md border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium">{employee.name}</h3>
                    <p className="text-sm text-muted-foreground">{employee.role}</p>
                  </div>
                  {hasGap && <AlertTriangle className="size-4 text-amber-500" />}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge>{employee.workload.regimeType === "dayBased" ? `${employee.workload.workUnits}x${employee.workload.restUnits}` : `${employee.workload.workUnits}x${employee.workload.restUnits}`}</Badge>
                  <Badge>{employee.workload.weeklyLimitHours}h semana</Badge>
                  {employee.allowsNightWork && <Badge>noturno</Badge>}
                </div>
              </article>
            );
          })}
      </div>
    </Panel>
  );
}
