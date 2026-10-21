const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const cache=new Map(),storage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
let outgoing;
function load(file) {
  if(file.endsWith(".json.ts"))return {default:JSON.parse(fs.readFileSync(path.join(__dirname,"../src",file.replace(/\.ts$/,"")),"utf8"))};
  if(cache.has(file))return cache.get(file);
  const exports={};cache.set(file,exports);
  const source=fs.readFileSync(path.join(__dirname,'../src',file),'utf8').replaceAll('import.meta.env','testEnv');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,Date,Set,Map,TextEncoder,window:{get localStorage(){return storage;}},Intl,crypto,structuredClone,AbortSignal,DOMException,testEnv:{DEV:false},fetch:async(url,options)=>{outgoing=JSON.parse(options.body);return Response.json({success:true,data:{assignments:outgoing.document.assignments}});},require:r=>r.startsWith('.')?load(path.posix.normalize(path.posix.join(path.posix.dirname(file),r))+'.ts'):require(r)});
  return exports;
}
const time=load('lib/dateTime.ts'),{sampleDocument}=load('data/sample.ts'),{useScheduleStore:store}=load('store/scheduleStore.ts');
const {serializeNative,importNative,solveSchedule}=load('lib/api.ts');
const {employeePrintRows,dayOffset}=load('lib/printSchedule.ts');
const {authorizedHolidayShift}=load('lib/holidays.ts');
const plain=x=>JSON.parse(JSON.stringify(x));
function document(start='2026-10-21T09:00:00',end='2026-10-21T18:00:00',pause={start:'2026-10-21T13:00:00',end:'2026-10-21T14:00:00'}) {
  const d=structuredClone(sampleDocument);d.company.timeZone='America/Cuiaba';d.planningPeriod={start:'2026-10-21',end:'2026-10-22'};
  d.assignments=[{...d.assignments[0],start,end,break:pause,tags:['holiday:2026-10-21']}];return d;
}
test('legacy UTC and offset timestamps convert in the company zone independently of the device zone',()=>{
  assert.equal(time.civilDateTime('2026-10-21T13:00:00Z'),'2026-10-21T09:00:00');
  assert.equal(time.civilDateTime('2026-10-21T09:00:00-04:00'),'2026-10-21T09:00:00');
  assert.equal(time.civilDateTime('2026-10-21T13:00:00Z','Asia/Tokyo'),'2026-10-21T22:00:00');
  assert.equal(time.datePart('2026-10-21T02:00:00Z'),'2026-10-20');
  assert.equal(time.displayClock('2026-10-21T02:00:00Z'),'22:00');
  assert.equal(time.dateTimeInput('2026-10-21T13:00:00Z'),'2026-10-21T09:00');
  assert.throws(()=>time.civilDateTime('2026-02-30T13:00:00Z'));
});
test('09h survives calendar movement, export, import and the API payload',async()=>{
  store.getState().setDocument(document());
  const id=store.getState().document.assignments[0].id;
  // FullCalendar supplies native Date objects representing the displayed civil clock.
  store.getState().moveAssignment(id,time.formatCivilDateTime(new Date(2026,9,22,9)),time.formatCivilDateTime(new Date(2026,9,22,18)));
  const moved=store.getState().document;
  assert.equal(moved.assignments[0].start,'2026-10-22T09:00:00');
  assert.equal(moved.assignments[0].break.start,'2026-10-22T13:00:00');
  assert.ok(moved.updatedAt.endsWith('Z'));assert.ok(!moved.assignments[0].tags.some(t=>t.startsWith('holiday:')));
  const exported=serializeNative(moved);
  const imported=await importNative({size:Buffer.byteLength(exported),text:async()=>exported});
  await solveSchedule(imported);
  assert.equal(outgoing.document.assignments[0].start,'2026-10-22T09:00:00');
  assert.equal(outgoing.document.assignments[0].end,'2026-10-22T18:00:00');
  assert.equal(outgoing.document.company.timeZone,'America/Cuiaba');
  assert.equal(employeePrintRows(imported,'2026-10').find(r=>r.start).hours,'09:00–18:00');
});
test('legacy UTC fields normalize before import, holidays, printing and period ownership',async()=>{
  const d=document('2026-10-22T02:00:00Z','2026-10-22T10:00:00Z',{start:'2026-10-22T06:00:00Z',end:'2026-10-22T07:00:00Z'});
  d.company.holidays=[{date:'2026-10-21',name:'Feriado',closed:true}];
  d.employees[0].availability=[{start:'2026-10-22T02:00:00Z',end:'2026-10-22T10:00:00Z'}];
  const json=JSON.stringify(d),imported=await importNative({size:json.length,text:async()=>json});
  const a=imported.assignments[0];
  assert.equal(a.start,'2026-10-21T22:00:00');assert.equal(a.end,'2026-10-22T06:00:00');
  assert.equal(a.break.start,'2026-10-22T02:00:00');
  assert.equal(imported.employees[0].availability[0].start,a.start);
  assert.ok(authorizedHolidayShift(imported.company,a));
  const row=employeePrintRows(imported,'2026-10').find(r=>r.start);
  assert.equal(row.start,'2026-10-21');assert.equal(row.hours,'22:00–06:00 (+1d)');assert.equal(row.interval,'02:00 (+1d)–03:00 (+1d)');
  assert.equal(dayOffset(a.end,a.start),' (+1d)');
});
test('overnight movement keeps pauses and year/day transitions through a second round trip',async()=>{
  const d=document('2026-12-31T22:00:00','2027-01-01T06:00:00',{start:'2027-01-01T02:00:00',end:'2027-01-01T03:00:00'});
  d.assignments[0]=time.moveShift(d.assignments[0],'2027-01-01T22:00:00','2027-01-02T06:00:00');
  const encoded=serializeNative(d),imported=await importNative({size:encoded.length,text:async()=>encoded});
  assert.equal(imported.assignments[0].break.start,'2027-01-02T02:00:00');
  assert.equal(imported.assignments[0].start,'2027-01-01T22:00:00');
  assert.deepEqual(plain(imported.assignments[0]),plain(d.assignments[0]));
});

test('a version-1 browser document migrates UTC shifts once and persists version 2',()=>{
  const d=document('2026-10-21T13:00:00Z','2026-10-21T22:00:00Z',{start:'2026-10-21T17:00:00Z',end:'2026-10-21T18:00:00Z'});
  delete d.company.timeZone;
  let saved=JSON.stringify({version:1,state:{document:d,theme:'light',viewMode:'month'}});
  storage.getItem=()=>saved;storage.setItem=(_key,value)=>{saved=value;};
  store.persist.rehydrate();
  assert.equal(store.getState().document.assignments[0].start,'2026-10-21T09:00:00');
  assert.equal(store.getState().document.company.timeZone,'America/Cuiaba');
  assert.equal(JSON.parse(saved).version,2);
  store.persist.rehydrate();
  assert.equal(store.getState().document.assignments[0].start,'2026-10-21T09:00:00');
});
test('older API responses normalize shift, pause and analysis times before entering state',()=>{
  const a=document('2026-10-21T13:00:00Z','2026-10-21T22:00:00Z',{start:'2026-10-21T17:00:00Z',end:'2026-10-21T18:00:00Z'}).assignments[0];
  const result=time.normalizeResultTimes({assignments:[a],coverage:[{start:a.start,end:a.end}],gaps:[],conflicts:[],decisions:[],hiringSuggestions:[],optimizationSuggestions:[],coverageScore:1});
  assert.equal(result.assignments[0].start,'2026-10-21T09:00:00');
  assert.equal(result.assignments[0].break.start,'2026-10-21T13:00:00');
  assert.equal(result.coverage[0].start,'2026-10-21T09:00:00');
});
