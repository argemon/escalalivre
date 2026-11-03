import { documentSchema } from "../lib/documentSchema";
import { nowInstant } from "../lib/dateTime";
import { useState } from "react";
import { useScheduleStore } from "../store/scheduleStore";
import { Button } from "./ui";

export function RolesEditor() {
  const { document, setDocument } = useScheduleStore();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string>();
  const [coverageRoleIds, setCoverageRoleIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const roles = document.roles ?? [];
  function save() {
    const trimmed = name.trim();
    if (!trimmed) { setError("Informe o nome da função."); return; }
    if (roles.some(r => r.id !== editing && r.name.toLocaleLowerCase("pt-BR") === trimmed.toLocaleLowerCase("pt-BR"))) { setError("Esta função já está cadastrada."); return; }
    const validation=documentSchema.safeParse({ ...document, roles: editing ? roles.map(r => r.id === editing ? { ...r, name: trimmed, coverageRoleIds } : r) : [...roles, { id: crypto.randomUUID(), name: trimmed, coverageRoleIds }], updatedAt: nowInstant() });
    if(!validation.success){setError(validation.error.issues[0].message);return;}
    setDocument(validation.data);
    setName(""); setEditing(undefined); setCoverageRoleIds([]); setError("");
  }
  return <section className="space-y-3">
    <h3 className="font-semibold">Funções da empresa</h3>
    <p className="text-sm text-muted-foreground">Defina uma vez quais funções cada função pode cobrir. A autorização vale para todos os funcionários dessa função, inclusive novos cadastros.</p>
    <form className="space-y-2" onSubmit={e => { e.preventDefault(); save(); }}>
      <label className="block text-sm">Nome da função<input required className="mt-1 w-full rounded border border-border bg-background p-2" value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Vendedor" /></label>
      <fieldset className="space-y-2 rounded border border-border p-3"><legend>Esta função também pode cobrir</legend>
        <p className="text-xs text-muted-foreground">Selecione uma ou mais funções. Ex.: Gerente pode cobrir Caixa e Vendedor ao mesmo tempo, mantendo sua própria função atendida. A autorização vale só neste sentido e somente enquanto a pessoa estiver trabalhando.</p>
        {roles.filter(r => r.id !== editing).map(role => <label key={role.id} className="flex gap-2 text-sm"><input type="checkbox" checked={coverageRoleIds.includes(role.id)} onChange={e => setCoverageRoleIds(e.target.checked ? [...coverageRoleIds,role.id] : coverageRoleIds.filter(id => id !== role.id))} />Pode cobrir {role.name}</label>)}
        {!roles.some(r => r.id !== editing) && <p className="text-xs text-muted-foreground">Cadastre outras funções para autorizar a cobertura.</p>}
      </fieldset>
      <Button type="submit">{editing ? "Salvar função" : "Cadastrar função"}</Button>
      {editing && <Button type="button" onClick={() => { setEditing(undefined); setName(""); setCoverageRoleIds([]); setError(""); }}>Cancelar</Button>}
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    </form>
    {!roles.length && <p className="text-sm text-muted-foreground">Nenhuma função cadastrada. Comece adicionando uma função acima.</p>}
    {roles.map(role => {
      const people = document.employees.filter(e => e.roleId === role.id).length;
      const rules = document.company.coverage.filter(r => r.roleId === role.id).length;
      const used = people > 0 || rules > 0 || document.assignments.some(a => a.roleId === role.id)
        || roles.some(r => r.id !== role.id && r.coverageRoleIds?.includes(role.id)) || document.employees.some(e => e.coverageRoleIds?.includes(role.id));
      const covered = roles.filter(r => role.coverageRoleIds?.includes(r.id)).map(r => r.name);
      return <article key={role.id} className="space-y-2 rounded border border-border p-3">
        <h4 className="font-medium">{role.name}</h4>
        <p className="text-xs text-muted-foreground">{people} funcionários · {rules ? "Cobertura definida" : "Sem cobertura definida"}</p>
        <p className="text-sm">{covered.length ? "Também pode cobrir: " + covered.join(", ") : "Cobre a própria função"}</p>
        <div className="flex gap-2"><Button onClick={() => { setEditing(role.id); setName(role.name); setCoverageRoleIds([...(role.coverageRoleIds ?? [])]); setError(""); }}>Editar</Button><Button disabled={used} title={used ? "Remova os vínculos antes de excluir a função." : "Excluir função"} onClick={() => { setDocument({ ...document, roles: roles.filter(r => r.id !== role.id), updatedAt: nowInstant() }); if (editing === role.id) { setEditing(undefined); setName(""); setCoverageRoleIds([]); } }}>Excluir</Button></div>
        {used && <p className="text-xs text-muted-foreground">Para excluir, remova os vínculos com equipe, cobertura, turnos e substituições.</p>}
      </article>;
    })}
  </section>;
}
