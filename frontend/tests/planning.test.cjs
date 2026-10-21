const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(relative) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', relative), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, Date, Set, Map, require: r => load(path.posix.normalize(path.posix.join(path.posix.dirname(relative), r)) + ".ts") });
  return exports;
}
const { analyzeDocument } = load('lib/analysis.ts');
const { sampleDocument } = load('data/sample.ts');
function document() {
  const d = structuredClone(sampleDocument);
  d.company.coverage = [{ role: 'vendedor', day: 1, start: '09:00:00', end: '17:00:00', minimumEmployees: 1 }];
  d.assignments = [d.assignments[0]];
  return d;
}
test('detects lunch gaps before optimization', () => {
  const a = analyzeDocument(document());
  assert.equal(a.gaps.length, 1);
  assert.equal(a.gaps[0].start, '2026-05-18T13:00:00');
  assert.equal(a.gaps[0].end, '2026-05-18T14:00:00');
  assert.equal(a.coverageScore, 7/8);
});
test('splits coverage at minute boundaries', () => {
  const d = document();
  d.assignments[0].break = {start:'2026-05-18T13:15:00',end:'2026-05-18T13:45:00'};
  const a = analyzeDocument(d);
  assert.equal(a.gaps.length,1);
  assert.equal(a.gaps[0].start,'2026-05-18T13:15:00');
  assert.equal(a.gaps[0].end,'2026-05-18T13:45:00');
  assert.equal(a.coverageScore,0.938);
});
test('covers overnight requirements and discounts cross-day lunch', () => {
  const d = document();
  d.company.coverage = [{role:'vendedor',day:1,start:'22:00:00',end:'02:00:00',minimumEmployees:1}];
  d.assignments[0].start = '2026-05-18T19:00:00';
  d.assignments[0].end = '2026-05-19T07:00:00';
  d.assignments[0].break = {start:'2026-05-19T00:00:00',end:'2026-05-19T01:00:00'};
  const a = analyzeDocument(d);
  assert.equal(a.gaps.length,1);
  assert.equal(a.gaps[0].start,'2026-05-19T00:00:00');
  assert.equal(a.coverageScore,3/4);
});
test('does not count overlapping shifts as two employees', () => {
  const d = document();
  d.company.coverage[0].minimumEmployees = 2;
  d.assignments[0].break = undefined;
  d.assignments.push({...d.assignments[0],id:crypto.randomUUID()});
  const a = analyzeDocument(d);
  assert.equal(a.coverageScore,1/2);
  assert.equal(a.gaps[0].missingEmployees,1);
});
test('recalculates after coverage rules change', () => {
  const d = document();
  assert.equal(analyzeDocument(d).gaps.length,1);
  d.company.coverage=[];
  assert.equal(analyzeDocument(d).gaps.length,0);
  assert.equal(analyzeDocument(d).coverageScore,1);
});

test('custom working days are enforced but inherited days follow company', () => {
  const d = document();
  const e = d.employees.find(e => e.id === d.assignments[0].employeeId);
  e.inheritsCompanyDefaults = false;
  e.workingDays = [2];
  assert.ok(analyzeDocument(d).conflicts.some(c => c.code === 'workingDay'));
  e.inheritsCompanyDefaults = true;
  assert.ok(!analyzeDocument(d).conflicts.some(c => c.code === 'workingDay'));
});
