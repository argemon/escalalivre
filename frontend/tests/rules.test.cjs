const {test}=require('node:test'),assert=require('node:assert/strict');
const load=require('./source-loader.cjs')();
const {analyzeDocument}=load('lib/analysis.ts');
const {normalizeDocument,migrateDocument}=load('lib/documentLifecycle.ts');
const scenarios=require('../../shared/rule-scenarios.json').scenarios;
const plain=v=>JSON.parse(JSON.stringify(v));
for(const scenario of scenarios)test('shared rules: '+scenario.id,()=>{
  const original=JSON.stringify(scenario.request.document);
  const result=analyzeDocument(scenario.request.document);
  assert.deepEqual([...new Set(result.conflicts.map(c=>c.code))].sort(),scenario.expectedCodes);
  assert.equal(JSON.stringify(scenario.request.document),original);
});
test('normalization is idempotent and never repairs shift hours, break or role',()=>{
  const d=structuredClone(scenarios[0].request.document);d.assignments[0].role='Outra função';d.assignments[0].break=null;d.assignments[0].source='solver';d.assignments[0].tags=[];
  const original=plain(d.assignments.map(({start,end,break:pause,role,tags})=>({start,end,break:pause,role,tags})));
  const normalized=normalizeDocument(d);
  assert.deepEqual(plain(normalized.assignments.map(({start,end,break:pause,role,tags})=>({start,end,break:pause,role,tags}))),original);
  assert.deepEqual(plain(normalizeDocument(normalized)),plain(normalized));
});
test('UTC conversion belongs to a named, idempotent migration',()=>{
  const d=structuredClone(scenarios[0].request.document);d.assignments[0].start='2026-10-19T12:00:00Z';d.assignments[0].end='2026-10-19T21:00:00Z';d.assignments[0].break=null;
  assert.equal(normalizeDocument(d).assignments[0].start,'2026-10-19T12:00:00Z');
  const migration=migrateDocument(d);assert.ok(migration.applied.includes('qualified-times-to-company-civil-v1'));
  assert.equal(migration.document.assignments[0].start,'2026-10-19T08:00:00');
  assert.deepEqual(plain(migrateDocument(migration.document).applied),[]);
});
test('ordinary store edits preserve unrelated assignments and never insert or move a pause',()=>{
  const {useScheduleStore:store}=load('store/scheduleStore.ts');
  const d=structuredClone(scenarios[0].request.document);d.assignments[0].source='solver';d.assignments[0].break=null;d.assignments[0].tags=[];
  store.getState().setDocument(d);const before=plain(store.getState().document.assignments);
  store.getState().setPlanningPeriod({start:'2026-10-19',end:'2026-10-20'});
  store.getState().upsertEmployee({...store.getState().document.employees[0],name:'Novo nome'});
  assert.deepEqual(plain(store.getState().document.assignments),before);
  assert.ok(store.getState().analysis.conflicts.some(c=>c.code==='interval'));
});
