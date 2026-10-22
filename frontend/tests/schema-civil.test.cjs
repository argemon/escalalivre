const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');

// Run identical import bytes in separate processes so each device zone is actually applied.
const harness=fs.readFileSync(path.join(__dirname,'recovery.test.cjs'),'utf8').split("test('native exports")[0];
const checks=`
const {load}=session(memory()),native=load('lib/nativeDocument.ts'),{documentSchema}=load('lib/documentSchema.ts');
const short={start:'2026-03-08T02:30:00',end:'2026-03-08T03:00:00'};
function doc() {
  const d=fixture(load);d.company.timeZone='America/Cuiaba';d.planningPeriod={start:'2026-03-08',end:'2026-03-08'};
  d.assignments=[{...d.assignments[0],start:'2026-03-08T01:00:00',end:'2026-03-08T04:00:00',break:{...short}}];
  d.employees[0].availability=[{...short}];d.employees[0].restrictions=[{...short}];return d;
}
const raw=JSON.stringify(doc()),imported=native.parseNativeText(raw);
assert.equal(imported.company.timeZone,'America/Cuiaba');
assert.deepEqual(JSON.parse(JSON.stringify(imported.assignments[0].break)),short);
assert.deepEqual(JSON.parse(JSON.stringify(imported.employees[0].availability[0])),short);
assert.deepEqual(JSON.parse(JSON.stringify(imported.employees[0].restrictions[0])),short);
const shortShift=doc();Object.assign(shortShift.assignments[0],short,{break:undefined});
assert.equal(native.parseNativeText(JSON.stringify(shortShift)).assignments[0].start,short.start);
// Reject equal/reversed civil windows even when DST would make them appear positive.
for(const end of [short.end,short.start,'2026-03-08T02:00:00'])for(const field of ['availability','restrictions','break','shift']){
  const d=doc(),window={start:short.end,end};
  if(field==='shift')Object.assign(d.assignments[0],window,{break:undefined});
  else if(field==='break')d.assignments[0].break=window;
  else d.employees[0][field]=[window];
  assert.equal(documentSchema.safeParse(d).success,false,field+' reversed/equal');
}
// Device DST can incorrectly move a pause that precedes the shift inside it.
const outside=doc();Object.assign(outside.assignments[0],{start:'2026-03-08T03:00:00',end:'2026-03-08T04:30:00',break:{start:'2026-03-08T02:15:00',end:'2026-03-08T02:45:00'}});
assert.equal(documentSchema.safeParse(outside).success,false);
const after=doc();after.assignments[0].break={start:'2026-03-08T03:30:00',end:'2026-03-08T04:30:00'};
assert.equal(documentSchema.safeParse(after).success,false);
const overnight=doc();Object.assign(overnight.assignments[0],{start:'2026-03-07T22:00:00',end:'2026-03-08T06:00:00'});
assert.equal(documentSchema.safeParse(overnight).success,true);
const autumn=doc();Object.assign(autumn.assignments[0],{start:'2026-11-01T01:30:00',end:'2026-11-01T02:00:00',break:undefined});
assert.equal(documentSchema.safeParse(autumn).success,true);
const invalid=doc();invalid.assignments[0].break.start='2026-02-30T02:30:00';
assert.doesNotThrow(()=>assert.equal(documentSchema.safeParse(invalid).success,false));
`;
for(const zone of ['America/Cuiaba','America/New_York','UTC'])test('civil schema comparisons and native import are device-zone independent: '+zone,()=>{
  const result=spawnSync(process.execPath,['-e',harness+checks],{cwd:__dirname,env:{...process.env,TZ:zone},encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
});
