import type { EscalaLivreDocument } from "../types/schedule";

export function normalizeRoles(document: EscalaLivreDocument): EscalaLivreDocument {
  const roles = [...(document.roles ?? [])];
  const key = (name: string) => name.trim().toLocaleLowerCase("pt-BR");
  const resolve = (item: { role: string; roleId?: string }) => {
    let role = roles.find(r => r.id === item.roleId) ?? roles.find(r => key(r.name) === key(item.role));
    if (!role) { role = { id: crypto.randomUUID(), name: item.role.trim() }; roles.push(role); }
    return { ...item, roleId: role.id, role: role.name };
  };
  const employees = document.employees.map(e => ({ ...e, ...resolve(e), coverageRoleIds:e.coverageRoleIds ?? [] }));
  const coverage = document.company.coverage.map(r => r.scope === "team" ? {...r,roleId:undefined,role:"Equipe (qualquer função)"} : ({ ...r, ...resolve(r) }));
  const assignments = document.assignments.map(a => ({...a,...resolve(a)}));
  return normalizeCoverageRoles({ ...document, roles, employees, assignments, company: { ...document.company, coverage } });
}

// Legacy names are imported once; an explicit ID list (including []) is authoritative.
export function migrateCoverageRoles(document: EscalaLivreDocument): EscalaLivreDocument {
  const roles = [...(document.roles ?? [])];
  const key = (name: string) => name.trim().toLocaleLowerCase("pt-BR");
  const employees = document.employees.map(employee => {
    if (employee.coverageRoleIds !== undefined || employee.coverageRoles === undefined) return employee;
    const coverageRoleIds = [...new Set((employee.coverageRoles ?? []).map(name => {
      let role = roles.find(role => key(role.name) === key(name));
      if (!role) {
        role = { id: crypto.randomUUID(), name: name.trim() };
        roles.push(role);
      }
      return role.id;
    }))];
    return { ...employee, coverageRoleIds };
  });
  return { ...document, ...(roles.length || document.roles ? { roles } : {}), employees };
}

// Derive transport names without modifying unrelated fields during native validation.
export function normalizeCoverageRoles(document: EscalaLivreDocument): EscalaLivreDocument {
  return { ...document, employees: document.employees.map(employee => employee.coverageRoleIds === undefined ? employee : {
    ...employee,
    coverageRoles: [...new Set(employee.coverageRoleIds.map(id => document.roles?.find(role => role.id === id)?.name).filter((name): name is string => Boolean(name)))],
  }) };
}
