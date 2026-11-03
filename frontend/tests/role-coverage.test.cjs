const {test}=require('node:test'),assert=require('node:assert/strict');
const sourceLoader=require('./source-loader.cjs');
const load=sourceLoader();
const {analyzeDocument}=load('lib/analysis.ts');
const {canCover}=load('lib/coverageAllocation.ts');
const {serializeNative,parseNativeText}=load('lib/nativeDocument.ts');
const {documentSchema}=load('lib/documentSchema.ts');
const scenarios=require('../../shared/role-coverage-scenarios.json').scenarios;
const plain=x=>JSON.parse(JSON.stringify(x));
for(const s of scenarios)test('role coverage: '+s.id,()=>{
  const before=JSON.stringify(s.request.document),result=analyzeDocument(s.request.document);
  assert.equal(result.coverageScore,s.expectedScore);
  if(s.expectedCounts)for(const b of result.coverage)assert.equal(b.assigned,s.expectedCounts[b.role]);
  assert.equal(JSON.stringify(s.request.document),before);
  if(s.id==='role-authorizes-outside-hours-demand'){
    assert.ok(!result.conflicts.some(c=>c.severity==='error'&&['workingDay','outsideHours'].includes(c.code)));
    const {weeklyCoverage}=load('lib/weeklyCoverage.ts');
    assert.ok(weeklyCoverage({...s.request.document,assignments:[]},'2026-11-04').length);
  }
});

test('role grants survive native export, reload and rename without becoming personal grants',()=>{
  const d=structuredClone(scenarios[0].request.document),before=plain(d.assignments);
  const restored=parseNativeText(serializeNative(d));
  assert.deepEqual(plain(restored.roles),plain(d.roles));
  assert.deepEqual(plain(restored.assignments),before);
  assert.deepEqual(plain(restored.employees.map(e=>e.coverageRoleIds)),[[],[]]);
  const store=load('store/scheduleStore.ts').useScheduleStore;store.getState().setDocument(restored);
  const roles=restored.roles.map(r=>r.id===d.roles[0].id?{...r,name:'Supervisor'}:r);
  store.getState().setDocument({...restored,roles});
  assert.equal(store.getState().analysis.coverageScore,1);
  const employee={...store.getState().document.employees[0],id:crypto.randomUUID(),name:'Novo gerente'};
  store.getState().upsertEmployee(employee);
  assert.ok(d.company.coverage.slice(1).every(r=>canCover(employee,r,store.getState().document.roles)));
});

test('revoking a role grant updates every employee without rewriting shifts or individual grants',()=>{
  const d=structuredClone(scenarios[0].request.document),before=JSON.stringify(d.assignments);
  const store=load('store/scheduleStore.ts').useScheduleStore;store.getState().setDocument(d);
  store.getState().setDocument({...d,roles:d.roles.map(r=>({...r,coverageRoleIds:[]}))});
  assert.equal(JSON.stringify(store.getState().document.assignments),before);
  assert.equal(store.getState().analysis.coverageScore,0.333);
  for(const e of store.getState().document.employees)assert.ok(!canCover(e,d.company.coverage[1],store.getState().document.roles));
});

test('role list validation bounds collections before migration and rejects malformed IDs',()=>{
  for(const invalid of [Array(51).fill(crypto.randomUUID()),['bad-id'],[null],{},'Caixa']){
    const d=structuredClone(scenarios[0].request.document);d.roles[0].coverageRoleIds=invalid;
    assert.equal(documentSchema.safeParse(d).success,false);
  }
});

test('an unknown explicit own-role ID never falls back to a matching role name',()=>{
  const d=scenarios[0].request.document;
  assert.equal(canCover({...d.employees[0],roleId:crypto.randomUUID()},d.company.coverage[1],d.roles),false);
});
