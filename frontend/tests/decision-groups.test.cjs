const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../src/lib/decisionGroups.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: exportsObject });

test('groups interleaved shifts by employee while preserving different explanations', () => {
  const decisions = [
    { employeeId: 'a', assignmentId: '1', reason: 'Cobertura A', factors: ['Descanso', 'Pausa 12h'] },
    { employeeId: 'b', assignmentId: '2', reason: 'Cobertura B', factors: ['Descanso'] },
    { employeeId: 'a', assignmentId: '3', reason: 'Cobertura A', factors: ['Descanso', 'Pausa 13h'] },
    { employeeId: 'a', assignmentId: '4', reason: 'Outra função', factors: ['Descanso', 'Pausa 12h'] },
  ];
  const groups = exportsObject.groupDecisions(decisions);
  assert.equal(groups.length, 2);
  assert.deepEqual(Array.from(groups[0].commonFactors), ['Descanso']);
  assert.deepEqual(Array.from(groups[0].reasons), ['Cobertura A', 'Outra função']);
  assert.deepEqual(Array.from(groups[0].shifts, shift => shift.assignmentId), ['1', '3', '4']);
  assert.equal(groups[1].employeeId, 'b');
  assert.equal(decisions[0].factors.length, 2);
});

test('empty explanations produce no employee cards', () => {
  assert.equal(exportsObject.groupDecisions([]).length, 0);
});
