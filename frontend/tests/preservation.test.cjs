const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const cache=new Map();
const stored=new Map();
const storage={getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value),removeItem:key=>stored.delete(key)};
function load(file) {
  if(file.endsWith(".json.ts"))return {default:JSON.parse(fs.readFileSync(path.join(__dirname,"../src",file.replace(/\.ts$/,"")),"utf8"))};
  if(cache.has(file))return cache.get(file);
  const exports={};cache.set(file,exports);
  const source=fs.readFileSync(path.join(__dirname,'../src',file),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,Date,Set,Map,TextEncoder,window:{get localStorage(){return storage;}},crypto,structuredClone,require:r=>r.startsWith('.')?load(path.posix.normalize(path.posix.join(path.posix.dirname(file),r))+'.ts'):require(r)});
  return exports;
}
const {replacePeriodAssignments,weeklyWork}=load('lib/scheduleWindow.ts');
const {sampleDocument}=load('data/sample.ts');
const {useScheduleStore:store}=load('store/scheduleStore.ts');
const {analyzeDocument}=load('lib/analysis.ts');
const plain=x=>JSON.parse(JSON.stringify(x));
function document() {const d=structuredClone(sampleDocument);d.planningPeriod={start:'2026-10-19',end:'2026-10-19'};d.assignments=[];return d;}
function shift(id,start,end) {return {...structuredClone(sampleDocument.assignments[0]),id,start,end,break:undefined,tags:['original'],source:'manual'};}
const result=assignments=>({assignments,conflicts:[],coverage:[],gaps:[],hiringSuggestions:[],optimizationSuggestions:[],decisions:[],coverageScore:1});

test('replacement owns the entire overnight shift by its start date',()=>{
  const d=document(),before=shift('before','2026-10-18T22:00:00','2026-10-19T06:00:00'),old=shift('old','2026-10-19T22:00:00','2026-10-20T06:00:00'),after=shift('after','2026-10-20T22:00:00','2026-10-21T06:00:00'),fresh={...old,id:'fresh'};
  d.assignments=[before,old,after];
  const actual=replacePeriodAssignments(d,[{...before,tags:['server changed history']},fresh,after]);
  assert.deepEqual(plain(actual.map(a=>a.id)),['before','after','fresh']);
  assert.equal(actual[0],before);assert.equal(actual[1],after);assert.equal(actual[2],fresh);
  assert.deepEqual(plain(replacePeriodAssignments({...d,assignments:actual},[fresh]).map(a=>a.id)),['before','after','fresh']);
});
test('store applies a full response without duplicates or normalizing preserved shifts again',()=>{
  const d=document();d.assignments=[shift('old','2026-10-19T08:00:00','2026-10-19T12:00:00')];store.getState().setDocument(d);
  // Emulate stored legacy data: generation must never rewrite it.
  const submitted=store.getState().document;
  const before=shift('before','2026-10-18T22:00:00','2026-10-19T06:00:00');
  const after=shift('after','2026-10-20T22:00:00','2026-10-21T06:00:00');
  submitted.assignments.push(before,after);
  const snapshot=JSON.stringify([before,after]);
  const fresh=shift('fresh','2026-10-19T22:00:00','2026-10-20T06:00:00');
  store.getState().applyGeneratedSchedule(submitted,result([before,fresh,after]));
  const actual=store.getState().document.assignments;
  assert.equal(actual.length,3);assert.equal(actual[0],before);assert.equal(actual[1],after);
  assert.equal(JSON.stringify(actual.slice(0,2)),snapshot);
  assert.equal(store.getState().analysis.assignments,actual);
});
test('failed or stale generation never replaces the current schedule',()=>{
  store.getState().setDocument(document());const submitted=store.getState().document;
  for(const code of ['solverInfeasible','solverTimeout','solverInvalid']){
    store.getState().applyGeneratedSchedule(submitted,{...result([]),conflicts:[{code,severity:'error',message:'Failure'}]});
    assert.equal(store.getState().document,submitted);assert.equal(store.getState().solverStatus,'invalid');
  }
  store.getState().setPlanningPeriod({start:'2026-10-20',end:'2026-10-20'});
  const current=store.getState().document;
  store.getState().applyGeneratedSchedule(submitted,result([shift('stale','2026-10-19T08:00:00','2026-10-19T12:00:00')]));
  assert.equal(store.getState().document,current);assert.equal(store.getState().solverStatus,'idle');
});
test('weekly hours split across Sunday midnight and discount each part of the break',()=>{
  const a=shift('night','2026-10-24T22:00:00','2026-10-25T02:00:00');
  a.break={start:'2026-10-24T23:30:00',end:'2026-10-25T00:30:00'};
  const weeks=weeklyWork(a);
  assert.equal(weeks.length,2);assert.equal(weeks[0].milliseconds,1.5*3600000);assert.equal(weeks[1].milliseconds,1.5*3600000);
  const exact=weeklyWork(shift('exact','2026-10-24T20:00:00','2026-10-25T00:00:00'));
  assert.equal(exact.length,1);
});
test('local analysis sees the weekly limit and cycle on the later preserved shift',()=>{
  const d=document(),person=d.employees[0];d.employees=[person];
  person.inheritsCompanyDefaults=true;d.company.defaultWorkload={regimeType:'dayBased',workUnits:1,restUnits:1,weeklyLimitHours:4,defaultShiftDuration:'04:00:00'};
  d.assignments=[shift('inside','2026-10-19T08:00:00','2026-10-19T12:00:00'),shift('after','2026-10-20T08:00:00','2026-10-20T12:00:00')];
  const analysis=analyzeDocument(d);
  assert.ok(analysis.conflicts.some(c=>c.code==='weeklyLimit'));assert.ok(analysis.conflicts.some(c=>c.code==='regime'&&c.start.startsWith('2026-10-20')));
  d.company.defaultWorkload.workUnits=7;d.company.defaultWorkload.restUnits=0;d.company.defaultWorkload.weeklyLimitHours=5;
  d.assignments=[shift('tail','2026-10-17T22:00:00','2026-10-18T02:00:00'),shift('inside','2026-10-19T08:00:00','2026-10-19T12:00:00')];
  assert.ok(analyzeDocument(d).conflicts.some(c=>c.code==='weeklyLimit'));
});
