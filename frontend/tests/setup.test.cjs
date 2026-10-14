const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.join(__dirname, '..') + '/';
const ts = require(root + 'node_modules/typescript');
function load(relative) {
  const exports = {};
  const source = fs.readFileSync(root+'src/'+relative, 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, Date, Set, Map, require: r => load(path.posix.normalize(path.posix.join(path.posix.dirname(relative), r))+'.ts') });
  return exports;
}
const { sampleDocument } = load('data/sample.ts');
const { analyzeDocument } = load('lib/analysis.ts');
const { assignmentLabel } = load('lib/planning.ts');
const { weeklyCoverage } = load('lib/weeklyCoverage.ts');
test('shift labels preserve 07:30 rather than rounding to 07h', () => {
  assert.equal(assignmentLabel({start:'2026-10-14T07:30:00',end:'2026-10-14T17:30:00'}),'07:30–17:30');
});
test('lunch closure has no normal coverage demand', () => {
  const doc = structuredClone(sampleDocument);
  doc.company.opensAt='07:30:00';doc.company.closesAt='17:30:00';
  doc.company.middayClosure={start:'12:00:00',end:'13:00:00'};
  doc.company.coverage=[{role:'vendedor',day:1,start:'07:30:00',end:'17:30:00',minimumEmployees:1}];
  const result=analyzeDocument(doc);
  assert.ok(result.coverage.length);
  assert.ok(result.coverage.every(b => b.end.slice(11,16)<='12:00' || b.start.slice(11,16)>='13:00'));
  doc.company.coverage[0].allowsOutsideHours=true;
  assert.ok(analyzeDocument(doc).coverage.some(b => b.start.slice(11,16)>='12:00' && b.start.slice(11,16)<'13:00'));
});
test('predicted weekly coverage excludes the lunch closure', () => {
  const doc = structuredClone(sampleDocument);doc.assignments=[];
  doc.company.opensAt='07:30:00';doc.company.closesAt='17:30:00';
  doc.company.middayClosure={start:'12:00:00',end:'13:00:00'};
  doc.company.coverage=[{role:'vendedor',day:1,start:'07:30:00',end:'17:30:00',minimumEmployees:1}];
  const shifts=weeklyCoverage(doc,'2026-05-18');
  assert.ok(shifts.length);
  assert.ok(shifts.every(a => a.end.slice(11,16)<='12:00' || a.start.slice(11,16)>='13:00'));
});
