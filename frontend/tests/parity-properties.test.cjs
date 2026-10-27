const {test}=require('node:test'),assert=require('node:assert/strict');
const {boundaries,generated,SEEDS}=require('../../shared/parity-corpus.cjs');
const {digest}=require('../../shared/parity-contract.cjs');
const load=require('./source-loader.cjs')();
const {analyzeDocument}=load('lib/analysis.ts');
const {migrateDocument}=load('lib/documentLifecycle.ts');
const {replacePeriodAssignments}=load('lib/scheduleWindow.ts');
const plain=v=>JSON.parse(JSON.stringify(v));
const shifts=items=>plain(items.map(a=>({...a,break:a.break??null}))).sort((a,b)=>a.id.localeCompare(b.id));
for(const scenario of [...boundaries(),...SEEDS.flatMap(seed=>generated(seed))])test('bounded parity properties: '+scenario.id,()=>{
 const d=scenario.request.document,before=JSON.stringify(d),result=analyzeDocument(d);
 const first=migrateDocument(d),second=migrateDocument(first.document);
 assert.deepEqual(plain(second.document),plain(first.document));assert.deepEqual(plain(second.applied),[]);
 assert.deepEqual(shifts(first.document.assignments),shifts(d.assignments));
 assert.deepEqual(digest(analyzeDocument(first.document)),digest(result),'migration preserves diagnosis and coverage');
 const selected=d.assignments.filter(a=>a.start.slice(0,10)>=d.planningPeriod.start&&a.start.slice(0,10)<=d.planningPeriod.end);
 assert.deepEqual(shifts(replacePeriodAssignments(d,selected)),shifts(d.assignments));
 assert.deepEqual(shifts(replacePeriodAssignments(d,[])),shifts(d.assignments.filter(a=>!selected.includes(a))));
 const preferencesRemoved={...d,employees:d.employees.map(e=>({...e,preferences:[],preferredDaysOff:[]}))};
 assert.deepEqual(digest(analyzeDocument(preferencesRemoved)),digest(result),'preferences never become mandatory diagnosis');
 assert.equal(JSON.stringify(d),before);
 if(scenario.expectedScore!==undefined)assert.equal(result.coverageScore,scenario.expectedScore);
 if(scenario.expectedGap)assert.ok(result.gaps.some(g=>JSON.stringify(plain(g))===JSON.stringify(scenario.expectedGap)));
 for(const code of scenario.requiredCodes??[])assert.ok(result.conflicts.some(c=>c.code===code),code);
 for(const code of scenario.forbiddenCodes??[])assert.ok(!result.conflicts.some(c=>c.code===code),code);
});
test('seed generation is reproducible and bounded',()=>{
 for(const seed of SEEDS)assert.deepEqual(generated(seed),generated(seed));
 for(const count of [0,33,Infinity])assert.throws(()=>generated(SEEDS[0],count));
 assert.throws(()=>generated(-1));assert.throws(()=>generated(2**32));
});
test('parity digest detects every contracted field and diagnostic multiplicity',()=>{
 const result={conflicts:[{code:'interval',severity:'error',employeeId:'one',start:'start',end:'end',role:'role'}],coverage:[{start:'start',end:'end',role:'role',required:1,assigned:0,state:'uncovered'}],gaps:[{start:'start',end:'end',role:'role',missingEmployees:1}],coverageScore:0};
 for(const collection of ['conflicts','coverage','gaps'])for(const field of Object.keys(result[collection][0])){
  const copy=structuredClone(result);copy[collection][0][field]=typeof copy[collection][0][field]==='number'?2:'changed';assert.notDeepEqual(digest(copy),digest(result),collection+'.'+field);
 }
 const score=structuredClone(result);score.coverageScore=0.001;assert.notDeepEqual(digest(score),digest(result));
 const duplicate=structuredClone(result);duplicate.conflicts.push({...duplicate.conflicts[0]});assert.notDeepEqual(digest(duplicate),digest(result));
 const prose=structuredClone(result);prose.conflicts[0].message='translation';assert.deepEqual(digest(prose),digest(result));
 assert.throws(()=>digest({...result,coverageScore:NaN}));
});
test('qualified timestamp migration is idempotent across device daylight saving and preserves seconds',()=>{
 const d=boundaries()[0].request.document;
 d.assignments[0].start='2026-11-01T05:30:01.999Z';d.assignments[0].end='2026-11-01T06:30:02.999Z';
 d.company.timeZone='America/New_York';const before=JSON.stringify(d);
 const first=migrateDocument(d),second=migrateDocument(first.document);
 assert.equal(first.document.assignments[0].start,'2026-11-01T01:30:01');assert.equal(first.document.assignments[0].end,'2026-11-01T01:30:02');
 assert.deepEqual(plain(second.document),plain(first.document));assert.deepEqual(plain(second.applied),[]);assert.equal(JSON.stringify(d),before);
});
