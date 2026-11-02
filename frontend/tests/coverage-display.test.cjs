const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const output = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../src/lib/coverageDisplay.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: output });

test('equal weekday coverage becomes one card without changing source requirements', () => {
  const rows = [1, 2, 3, 4, 5].map(day => ({ day, role: 'Equipe', scope: 'team', start: '07:30:00', end: '17:30:00', minimumEmployees: 1 }));
  const groups = output.groupCoverageForDisplay(rows);
  assert.equal(groups.length, 1);
  assert.equal(output.formatCoverageDays(groups[0].days), 'Seg a Sex');
  assert.equal(rows.length, 5);
  for (const change of [{ start: '08:00:00' }, { minimumEmployees: 2 }, { role: 'Monitor' }, { allowsOutsideHours: true }]) {
    assert.equal(output.groupCoverageForDisplay([...rows, { ...rows[0], ...change }]).length, 2);
  }
});

test('day labels preserve gaps and handle single days and full weeks', () => {
  assert.equal(output.formatCoverageDays([5, 1, 3]), 'Seg, Qua, Sex');
  assert.equal(output.formatCoverageDays([1]), 'Seg');
  assert.equal(output.formatCoverageDays([0, 1, 2, 3, 4, 5, 6]), 'Dom a Sáb');
});
