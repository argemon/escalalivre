import type { EscalaLivreDocument } from "../types/schedule";

export function normalizeRoles(document: EscalaLivreDocument): EscalaLivreDocument {
  const roles = [...(document.roles ?? [])];
  const key = (name: string) => name.trim().toLocaleLowerCase("pt-BR");
  const resolve = (item: { role: string; roleId?: string }) => {
    let role = roles.find(r => r.id === item.roleId) ?? roles.find(r => key(r.name) === key(item.role));
    if (!role) { role = { id: crypto.randomUUID(), name: item.role.trim() }; roles.push(role); }
    return { ...item, roleId: role.id, role: role.name };
  };
  const employees = document.employees.map(e => ({ ...e, ...resolve(e), coverageRoles:(e.coverageRoleIds ?? []).map(id=>roles.find(r=>r.id===id)?.name).filter((name):name is string=>Boolean(name)) }));
  const coverage = document.company.coverage.map(r => r.scope === "team" ? {...r,roleId:undefined,role:"Equipe (qualquer função)"} : ({ ...r, ...resolve(r) }));
  const assignments = document.assignments.map(a => {
    const employee = employees.find(e => e.id === a.employeeId);
    return employee ? { ...a, role: employee.role, roleId: employee.roleId } : { ...a, ...resolve(a) };
  });
  return { ...document, roles, employees, assignments, company: { ...document.company, coverage } };
}
