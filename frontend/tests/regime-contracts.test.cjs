const {test}=require('node:test'),assert=require('node:assert/strict');
const load=require('./source-loader.cjs')();
const {civilMillis}=load('lib/civilTime.ts');
const {workMillis}=load('lib/policies/effectiveWork.ts');
const {fitsRestHistory,regimeRestMillis}=load('lib/policies/rest.ts');
const {canAddCycleDate}=load('lib/policies/dayCycle.ts');
for(const s of require('../../shared/regime-contract-scenarios.json').scenarios)test('shared regime contract: '+s.id,()=>{
  const a={...s.candidate,break:s.pause},start=civilMillis(a.start),end=civilMillis(a.end),rule=s.rule;
  const before=JSON.stringify(s),work=workMillis(a);
  const check=history=>end>start&&(rule.regimeType==='dayBased'?canAddCycleDate(start,history,rule):work<=rule.workUnits*3600000&&fitsRestHistory(start,end,history,regimeRestMillis(rule)));
  assert.equal(work/1000,s.expectedWorkSeconds);
  assert.equal(check(s.history),s.expectedAllowed);
  assert.equal(check([...s.history].reverse()),s.expectedAllowed);
  assert.equal(check([...s.history,...s.history]),s.expectedAllowed);
  assert.equal(JSON.stringify(s),before);
});
