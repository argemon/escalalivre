const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = require('node:path').join(__dirname, '..') + '/';
const ts = require(root + 'node_modules/typescript');
function load(file) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(root+'src/'+file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, crypto, Set, Map, Date });
  return exports;
}
const { normalizeRoles } = load('lib/roles.ts');
const { sampleDocument } = load('data/sample.ts');
test('legacy documents share role IDs and normalization is stable', () => {
  const doc = normalizeRoles(structuredClone(sampleDocument));
  assert.ok(doc.roles.length);
  for (const e of doc.employees) {
    assert.equal(e.roleId, doc.roles.find(r => r.name === e.role).id);
    for (const r of doc.company.coverage.filter(r => r.role === e.role)) assert.equal(r.roleId, e.roleId);
  }
  assert.equal(JSON.stringify(normalizeRoles(doc)), JSON.stringify(doc));
});
test('renaming preserves links and updates coverage, employees and assignments', () => {
  const doc = normalizeRoles(structuredClone(sampleDocument));
  const id = doc.employees[0].roleId;
  doc.roles.find(r => r.id === id).name = 'Atendimento';
  const next = normalizeRoles(doc);
  for (const item of [...next.employees, ...next.company.coverage, ...next.assignments].filter(x => x.roleId === id)) assert.equal(item.role, 'Atendimento');
});
test('unused functions survive serialization and an empty setup has no functions', () => {
  const doc = normalizeRoles(structuredClone(sampleDocument));
  doc.roles.push({ id: crypto.randomUUID(), name: 'Segurança' });
  assert.ok(normalizeRoles(JSON.parse(JSON.stringify(doc))).roles.some(r => r.name === 'Segurança'));
  assert.equal(normalizeRoles({ ...doc, roles: [], employees: [], assignments: [], company: { ...doc.company, coverage: [] } }).roles.length, 0);
});
