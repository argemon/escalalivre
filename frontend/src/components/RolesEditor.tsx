import { nowInstant } from "../lib/dateTime";
import { useState } from "react";
import { useScheduleStore } from "../store/scheduleStore";
import { Button } from "./ui";

export function RolesEditor() {
  const { document, setDocument } = useScheduleStore();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string>();
  const [error, setError] = useState("");
  const roles = document.roles ?? [];
  function save() {
    const trimmed = name.trim();
    if (!trimmed) { setError("Informe o nome da função."); return; }
    if (roles.some(r => r.id !== editing && r.name.toLocaleLowerCase("pt-BR") === trimmed.toLocaleLowerCase("pt-BR"))) { setError("Esta função já está cadastrada."); return; }
    setDocument({ ...document, roles: editing ? roles.map(r => r.id === editing ? { ...r, name: trimmed } : r) : [...roles, { id: crypto.randomUUID(), name: trimmed }], updatedAt: nowInstant() });
    setName(""); setEditing(undefined); setError("");
  }
  return <section className="space-y-3">
    <h3 className="font-semibold">Funções da empresa</h3>
    <p className="text-sm text-muted-foreground">Cadastre as funções para usá-las na cobertura e na equipe.</p>
    <form className="space-y-2" onSubmit={e => { e.preventDefault(); save(); }}>
      <label className="block text-sm">Nome da função<input required className="mt-1 w-full rounded border border-border bg-background p-2" value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Vendedor" /></label>
      <Button type="submit">{editing ? "Salvar função" : "Cadastrar função"}</Button>
      {editing && <Button type="button" onClick={() => { setEditing(undefined); setName(""); setError(""); }}>Cancelar</Button>}
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    </form>
    {!roles.length && <p className="text-sm text-muted-foreground">Nenhuma função cadastrada. Comece adicionando uma função acima.</p>}
    {roles.map(role => {
      const people = document.employees.filter(e => e.roleId === role.id).length;
      const rules = document.company.coverage.filter(r => r.roleId === role.id).length;
      const used = people > 0 || rules > 0 || document.assignments.some(a => a.roleId === role.id);
      return <article key={role.id} className="space-y-2 rounded border border-border p-3">
        <h4 className="font-medium">{role.name}</h4>
        <p className="text-xs text-muted-foreground">{people} funcionários · {rules ? "Cobertura definida" : "Sem cobertura definida"}</p>
        <div className="flex gap-2"><Button onClick={() => { setEditing(role.id); setName(role.name); setError(""); }}>Editar</Button><Button disabled={used} title={used ? "Remova os vínculos antes de excluir a função." : "Excluir função"} onClick={() => { setDocument({ ...document, roles: roles.filter(r => r.id !== role.id), updatedAt: nowInstant() }); if (editing === role.id) { setEditing(undefined); setName(""); } }}>Excluir</Button></div>
        {used && <p className="text-xs text-muted-foreground">Para excluir, remova os vínculos com equipe, cobertura e turnos.</p>}
      </article>;
    })}
  </section>;
}
