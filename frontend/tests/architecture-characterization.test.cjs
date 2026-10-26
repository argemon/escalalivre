const {test}=require('node:test');
const assert=require('node:assert/strict');
const {analyzeDocument}=require('./source-loader.cjs')()('lib/analysis.ts');
const scenario=require('../../shared/rule-scenarios.json').scenarios.find(s=>s.id==='one-second-break-removes-coverage');
test('a one-second break removes coverage even when the rounded score is one',()=>{
  const result=analyzeDocument(scenario.request.document);
  assert.equal(result.gaps.length,1);
  const gap=result.gaps[0];
  assert.equal(gap.start,'2026-10-19T09:00:00');
  assert.equal(gap.end,'2026-10-19T09:00:01');
  assert.equal(gap.missingEmployees,1);
  assert.ok(result.coverage.some(b=>b.start===gap.start && b.end===gap.end && b.assigned===0));
  assert.equal(result.coverageScore,1);
  assert.equal(result.conflicts.length,0);
});
