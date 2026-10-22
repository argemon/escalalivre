const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript');
const cache = new Map();
let persistedStorage;
function load(relative) {
  if(relative.endsWith(".json.ts"))return {default:JSON.parse(fs.readFileSync(path.join(__dirname,"../src",relative.replace(/\.ts$/,"")),"utf8"))};
  if(cache.has(relative)) return cache.get(relative);
  const exports = {}; cache.set(relative,exports);
  const source = fs.readFileSync(path.join(__dirname,'../src',relative),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports, Date, Map, Set, TextEncoder,window:{get localStorage(){return persistedStorage;}}, crypto, structuredClone, require:r=>r.startsWith('.')?load(path.posix.normalize(path.posix.join(path.posix.dirname(relative),r))+'.ts'):require(r)});
  return exports;
}
const {sampleDocument,emptyDocument}=load('data/sample.ts');
const {migratePlanningPeriod,planningPeriod,periodError,planningDays}=load('lib/planningPeriod.ts');
const {analyzeDocument}=load('lib/analysis.ts');
const {weeklyCoverage}=load('lib/weeklyCoverage.ts');
const {documentSchema}=load('lib/documentSchema.ts');
const clone=()=>structuredClone(sampleDocument);
const plain=v=>JSON.parse(JSON.stringify(v));
test('legacy import preserves the old window exactly once',()=>{
  const d=clone();delete d.planningPeriod;
  const migrated=documentSchema.parse(d);
  assert.deepEqual(plain(migrated.planningPeriod),{start:'2026-05-18',end:'2026-05-24'});
  migrated.assignments=[];
  assert.deepEqual(plain(migratePlanningPeriod(migrated).planningPeriod),plain(migrated.planningPeriod));
});
test('legacy empty documents and new documents start today with seven days',()=>{
  const d=clone();delete d.planningPeriod;d.assignments=[];
  const migrated=migratePlanningPeriod(d), fresh=emptyDocument();
  assert.deepEqual(plain(migrated.planningPeriod),plain(fresh.planningPeriod));
  assert.equal(planningDays(migrated).length,7);
});
test('explicit period survives round trips and changes to the oldest shift',()=>{
  const d=clone();d.planningPeriod={start:'2026-10-01',end:'2026-10-31'};
  d.assignments[0].start='2025-01-01T09:00:00';d.assignments[0].end='2025-01-01T17:00:00';delete d.assignments[0].break;
  assert.deepEqual(plain(documentSchema.parse(JSON.parse(JSON.stringify(d))).planningPeriod),d.planningPeriod);
  assert.deepEqual(plain(planningPeriod(d)),{start:'2026-10-01T00:00:00',end:'2026-10-31T23:59:59'});
  assert.equal(planningDays(d).length,31);
});
test('empty schedules measure every selected day including the last',()=>{
  const d=clone();d.planningPeriod={start:'2026-10-19',end:'2026-10-26'};d.assignments=[];
  d.company.coverage=[{role:'vendedor',day:1,start:'09:00:00',end:'10:00:00',minimumEmployees:1}];
  const result=analyzeDocument(d);
  assert.deepEqual(plain(result.gaps.map(g=>g.start.slice(0,10))),['2026-10-19','2026-10-26']);
  assert.equal(result.coverageScore,0);
  assert.equal(weeklyCoverage(d,'2026-10-18').length,0);
  assert.equal(weeklyCoverage(d,'2026-10-27').length,0);
  assert.ok(weeklyCoverage(d,'2026-10-26').length);
});
test('period validation accepts one day and leap day and rejects invalid windows',()=>{
  assert.equal(periodError({start:'2028-02-29',end:'2028-02-29'}),undefined);
  for(const period of [{start:'2026-10-02',end:'2026-10-01'},{start:'2026-10-01',end:'2026-11-01'},{start:'2026-02-29',end:'2026-03-01'},{start:'',end:'2026-10-01'},{start:'1899-12-31',end:'1900-01-01'}]) {
    assert.ok(periodError(period));const d=clone();d.planningPeriod=period;assert.equal(documentSchema.safeParse(d).success,false);
  }
});
test('API generation sends the saved period rather than assignment dates',async()=>{
  const exports={};let payload;
  const source=fs.readFileSync(path.join(__dirname,'../src/lib/api.ts'),'utf8').replaceAll('import.meta.env','testEnv');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,testEnv:{DEV:false},AbortSignal,DOMException,TextEncoder,require:r=>load('lib/'+r.slice(2)+'.ts'),fetch:async(url,options)=>{payload=JSON.parse(options.body);return Response.json({success:true,data:{assignments:[]}});}});
  const d=clone();d.planningPeriod={start:'2026-10-19',end:'2026-10-19'};
  await exports.solveSchedule(d);
  assert.equal(payload.start,'2026-10-19T00:00:00');assert.equal(payload.end,'2026-10-19T23:59:59');
});

test('browser restoration migrates once and period changes recalculate and persist',()=>{
  const legacy=clone();delete legacy.planningPeriod;
  const data=new Map([['escalalivre-state',JSON.stringify({state:{document:legacy,theme:'dark',viewMode:'month'},version:0})]]);
  persistedStorage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
  const {useScheduleStore:store}=load('store/scheduleStore.ts');
  assert.deepEqual(plain(store.getState().document.planningPeriod),{start:'2026-05-18',end:'2026-05-24'});
  assert.equal(store.getState().theme,'dark');
  assert.equal(JSON.parse(data.get('escalalivre-state')).version,2);
  assert.deepEqual(JSON.parse(data.get('escalalivre-state')).state.document.planningPeriod,{start:'2026-05-18',end:'2026-05-24'});
  const period={start:'2026-10-19',end:'2026-10-19'};
  store.getState().setPlanningPeriod(period);
  assert.deepEqual(plain(store.getState().document.planningPeriod),period);
  assert.ok(store.getState().analysis.coverage.length);
  assert.ok(store.getState().analysis.coverage.every(b=>b.start.startsWith('2026-10-19')));
  assert.deepEqual(JSON.parse(data.get('escalalivre-state')).state.document.planningPeriod,period);
  const count=store.getState().document.assignments.length;
  store.getState().upsertAssignment({...legacy.assignments[0],start:'2020-01-01T09:00:00',end:'2020-01-01T17:00:00',break:undefined});
  assert.equal(store.getState().document.assignments.length,count);
  assert.deepEqual(plain(store.getState().document.planningPeriod),period);
  assert.throws(()=>store.getState().setPlanningPeriod({start:'2026-10-01',end:'2026-11-01'}));
  assert.deepEqual(plain(store.getState().document.planningPeriod),period);
});
