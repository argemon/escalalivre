const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function session(storage) {
  const cache=new Map();
  function load(file) {
    if(file.endsWith('.json.ts'))return {default:JSON.parse(fs.readFileSync(path.join(__dirname,'../src',file.replace(/\.ts$/,'')),'utf8'))};
    if(cache.has(file))return cache.get(file);
    const exports={};cache.set(file,exports);
    const source=fs.readFileSync(path.join(__dirname,'../src',file),'utf8');
    const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(code,{exports,Date,Map,Set,TextEncoder,Intl,crypto,structuredClone,window:{localStorage:storage},require:r=>r.startsWith('.')?load(path.posix.normalize(path.posix.join(path.posix.dirname(file),r))+'.ts'):require(r)});
    return exports;
  }
  return {load};
}
function memory(values={}) {const data=new Map(Object.entries(values));return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};}
const plain=v=>JSON.parse(JSON.stringify(v));
function fixture(load) {const d=structuredClone(load('data/sample.ts').sampleDocument);d.company.name='Meu planejamento';return d;}
function saved(document,extra={}) {return JSON.stringify({version:2,state:{document,theme:'dark',viewMode:'month',...extra}});}
test('native exports enforce their exact UTF-8 byte limit and every accepted export reimports',()=>{
  const {load}=session(memory()),native=load('lib/nativeDocument.ts'),d=fixture(load);
  d.company.name='Ação · 日本語 · 😀';
  const text=native.serializeNative(d);assert.equal(native.parseNativeText(text).company.name,d.company.name);
  const padding=native.MAX_NATIVE_BYTES-native.nativeBytes(text);
  const exact=text+' '.repeat(padding);assert.equal(native.nativeBytes(exact),native.MAX_NATIVE_BYTES);
  assert.equal(native.parseNativeText(exact).company.name,d.company.name);
  assert.throws(()=>native.parseNativeText(exact+' '),/1 MiB/);
  Object.assign(d,largeFixture(load));
  assert.throws(()=>native.serializeNative(d),/1 MiB/);
});
test('an invalid browser document preserves the original bytes and loads a valid backup',()=>{
  const storage=memory(),{load}=session(storage),d=fixture(load),native=load('lib/nativeDocument.ts');
  const raw='{"state":{"document":{"company":null}}';storage.setItem('escalalivre-state',raw);
  storage.setItem('escalalivre-recovery',JSON.stringify({version:1,copies:[{contents:native.serializeNative(d),reason:'Antes da importação',createdAt:'2026-10-21T13:00:00Z'}]}));
  const {useScheduleStore:store}=load('store/scheduleStore.ts'),{recovery}=load('lib/recoveryStorage.ts');
  assert.equal(store.getState().document.company.name,d.company.name);
  assert.equal(recovery.getSnapshot().protected,true);
  assert.ok(recovery.getSnapshot().copies.some(c=>c.contents===raw));
  store.getState().setTheme('light');assert.equal(storage.getItem('escalalivre-state'),raw);
  assert.equal(native.parseNativeText(native.serializeNative(store.getState().document)).id,d.id);
});
test('a readable but invalid graph never enters analysis or overrides store actions',()=>{
  const storage=memory(),{load}=session(storage),d=fixture(load);d.employees=null;
  const raw=saved(d,{setDocument:'bad',theme:'oops',viewMode:'bad'});storage.setItem('escalalivre-state',raw);
  const {useScheduleStore:store}=load('store/scheduleStore.ts'),{recovery}=load('lib/recoveryStorage.ts');
  assert.ok(Array.isArray(store.getState().document.employees));assert.equal(typeof store.getState().setDocument,'function');
  assert.ok(recovery.getSnapshot().copies.some(c=>c.contents===raw));assert.equal(storage.getItem('escalalivre-state'),raw);
});
test('getItem failure still allows exporting in-memory data and storage retry after access returns',()=>{
  const storage=memory();let denied=true;
  const get=storage.getItem;storage.getItem=key=>{if(denied)throw new Error('Access denied');return get(key);};
  const {load}=session(storage),{useScheduleStore:store}=load('store/scheduleStore.ts'),native=load('lib/nativeDocument.ts');
  const d=fixture(load);store.getState().setDocument(d);
  assert.equal(native.parseNativeText(native.serializeNative(store.getState().document)).id,d.id);
  assert.equal(store.getState().retryStorage(),false);
  denied=false;assert.equal(store.getState().retryStorage(),true);
  assert.equal(JSON.parse(storage.getItem('escalalivre-state')).state.document.id,d.id);
});
test('quota failures do not throw during editing or destroy the active document',()=>{
  const storage=memory(),{load}=session(storage),{useScheduleStore:store}=load('store/scheduleStore.ts'),d=fixture(load);
  storage.setItem=()=>{throw new Error('QuotaExceededError');};
  assert.doesNotThrow(()=>store.getState().setDocument(d));
  assert.equal(store.getState().document.company.name,d.company.name);
  assert.equal(load('lib/recoveryStorage.ts').recovery.getSnapshot().phase,'write-error');
  assert.doesNotThrow(()=>load('lib/nativeDocument.ts').serializeNative(store.getState().document));
});
test('import checkpoints survive a fresh session and can restore the exact former planning',()=>{
  const storage=memory(),{load}=session(storage),{useScheduleStore:store}=load('store/scheduleStore.ts'),old=fixture(load);
  store.getState().setDocument(old);const snapshot=plain(store.getState().document);
  const next=structuredClone(old);next.id=crypto.randomUUID();next.company.name='Importado';
  assert.equal(store.getState().importDocument(next),true);
  const fresh=session(storage),{useScheduleStore:reloaded}=fresh.load('store/scheduleStore.ts'),{recovery}=fresh.load('lib/recoveryStorage.ts');
  assert.equal(reloaded.getState().document.company.name,'Importado');
  const copy=recovery.getSnapshot().copies.find(c=>c.reason==='Antes da importação');assert.ok(copy?.native&&copy.durable);
  assert.equal(reloaded.getState().restoreRecovery(copy.contents),true);
  assert.deepEqual(plain(reloaded.getState().document),snapshot);
});
test('failed checkpoint blocks import until its recovery copy has been downloaded',()=>{
  const storage=memory(),{load}=session(storage),{useScheduleStore:store}=load('store/scheduleStore.ts'),{recovery}=load('lib/recoveryStorage.ts');
  const old=store.getState().document,next=fixture(load);storage.setItem=()=>{throw new Error('Quota');};
  assert.equal(store.getState().importDocument(next),false);assert.equal(store.getState().document,old);
  const copy=recovery.getSnapshot().copies.find(c=>c.reason==='Antes da importação');assert.ok(copy?.native&&!copy.durable);
  recovery.markDownloaded(copy.id);assert.equal(store.getState().importDocument(next),true);
  assert.equal(store.getState().document.company.name,next.company.name);
});
test('a generation checkpoint precedes replacement, failures and stale results do not replace data',()=>{
  const storage=memory(),{load}=session(storage),{useScheduleStore:store}=load('store/scheduleStore.ts'),{recovery}=load('lib/recoveryStorage.ts');
  const submitted=store.getState().document;
  const result={assignments:[],coverage:[],gaps:[],conflicts:[],decisions:[],optimizationSuggestions:[],hiringSuggestions:[],coverageScore:1};
  store.getState().applyGeneratedSchedule(submitted,{...result,conflicts:[{code:'solverTimeout',severity:'error',message:'Timeout'}]});
  assert.equal(store.getState().document,submitted);assert.equal(recovery.getSnapshot().copies.length,0);
  storage.setItem=()=>{throw new Error('Quota');};
  store.getState().applyGeneratedSchedule(submitted,result);assert.equal(store.getState().document,submitted);
  const copy=recovery.getSnapshot().copies.find(c=>c.reason==='Antes da geração');assert.ok(copy);
  recovery.markDownloaded(copy.id);store.getState().applyGeneratedSchedule(submitted,result);
  assert.notEqual(store.getState().document,submitted);assert.equal(store.getState().document.assignments.length,0);
  const current=store.getState().document;store.getState().applyGeneratedSchedule(submitted,result);assert.equal(store.getState().document,current);
});
test('a failed backup-key read does not prevent valid primary recovery and future state versions stay protected',()=>{
  const storage=memory(),{load}=session(storage),d=fixture(load),get=storage.getItem;
  storage.setItem('escalalivre-state',saved(d));storage.getItem=key=>{if(key==='escalalivre-recovery')throw new Error('Backup denied');return get(key);};
  const {useScheduleStore:store}=load('store/scheduleStore.ts');assert.equal(store.getState().document.id,d.id);
  const future=memory({'escalalivre-state':JSON.stringify({version:99,state:{document:d}})}),fresh=session(future);
  const {useScheduleStore:other}=fresh.load('store/scheduleStore.ts');assert.equal(typeof other.getState().setDocument,'function');
  assert.equal(fresh.load('lib/recoveryStorage.ts').recovery.getSnapshot().protected,true);
});

test('a primary document discovered after denied reads is offered as a restorable copy before overwrite',()=>{
  const storage=memory(),{load}=session(storage),previous=fixture(load);previous.company.name='Arquivo antigo';
  const raw=saved(previous);storage.setItem('escalalivre-state',raw);
  const get=storage.getItem;let denied=true;storage.getItem=key=>{if(denied&&key==='escalalivre-state')throw new Error('Denied');return get(key);};
  const {useScheduleStore:store}=load('store/scheduleStore.ts'),{recovery}=load('lib/recoveryStorage.ts');
  denied=false;assert.equal(store.getState().retryStorage(),false);assert.equal(storage.getItem('escalalivre-state'),raw);
  const copy=recovery.getSnapshot().copies.find(c=>c.reason==='Documento reencontrado no navegador');assert.ok(copy?.native);
  assert.equal(store.getState().restoreRecovery(copy.contents),true);assert.equal(store.getState().document.company.name,'Arquivo antigo');
});
test('valid saved preferences are sanitized and cannot inject store actions',()=>{
  const storage=memory(),{load}=session(storage),d=fixture(load);
  storage.setItem('escalalivre-state',saved(d,{setDocument:'bad',theme:'invalid',viewMode:'invalid'}));
  const {useScheduleStore:store}=load('store/scheduleStore.ts');
  assert.equal(store.getState().document.id,d.id);assert.equal(typeof store.getState().setDocument,'function');
  assert.equal(store.getState().theme,'light');assert.equal(store.getState().viewMode,'timeline');
});
test('import reads and checks the actual text bytes even when the file size is misleading',async()=>{
  const {load}=session(memory()),native=load('lib/nativeDocument.ts'),text=native.serializeNative(fixture(load));
  await assert.rejects(native.readNativeFile({size:1,text:async()=>text+' '.repeat(native.MAX_NATIVE_BYTES)}),/1 MiB/);
});

test('browser recovery and native import do not rewrite saved shift times, pauses or tags',()=>{
  const storage=memory(),{load}=session(storage),d=fixture(load);
  d.assignments=[{...d.assignments[0],source:'solver',start:'2026-05-18T09:00:00',end:'2026-05-18T17:00:00',break:undefined,tags:['legacy']}];
  storage.setItem('escalalivre-state',saved(d));
  const {useScheduleStore:store}=load('store/scheduleStore.ts');
  assert.equal(store.getState().document.assignments[0].end,'2026-05-18T17:00:00');
  assert.equal(store.getState().document.assignments[0].break,undefined);
  assert.deepEqual(plain(store.getState().document.assignments[0].tags),['legacy']);
  assert.equal(store.getState().importDocument(d),true);
  assert.equal(store.getState().document.assignments[0].end,d.assignments[0].end);
  assert.equal(store.getState().document.assignments[0].break,undefined);
});

test('the three latest checkpoints persist in order and the newest is selected after corruption',()=>{
  const storage=memory(),{load}=session(storage),{useScheduleStore:store}=load('store/scheduleStore.ts');
  for(let i=0;i<4;i++) {const d=fixture(load);d.id=crypto.randomUUID();d.company.name='Plano '+i;assert.equal(store.getState().importDocument(d),true);}
  storage.setItem('escalalivre-state','broken JSON');
  const fresh=session(storage),{useScheduleStore:reloaded}=fresh.load('store/scheduleStore.ts'),{recovery}=fresh.load('lib/recoveryStorage.ts');
  assert.equal(recovery.getSnapshot().copies.filter(c=>!c.original).length,3);
  assert.equal(reloaded.getState().document.company.name,'Plano 2');
});
test('exports reject invalid migration output rather than produce a file that fails reimport',()=>{
  const {load}=session(memory()),d=fixture(load);delete d.planningPeriod;
  d.assignments=[{...d.assignments[0],start:'2100-12-31T09:00:00',end:'2100-12-31T13:00:00',break:undefined}];
  assert.throws(()=>load('lib/nativeDocument.ts').serializeNative(d),/inválido/);
});

test('a checkpoint removed from browser storage is not trusted from a stale in-memory flag',()=>{
  const storage=memory(),{load}=session(storage),{recovery}=load('lib/recoveryStorage.ts'),d=fixture(load);
  assert.equal(recovery.checkpoint(d,'Primeira cópia'),true);
  storage.removeItem('escalalivre-recovery');storage.setItem=()=>{throw new Error('Quota');};
  assert.equal(recovery.checkpoint(d,'Nova substituição'),false);
  assert.equal(recovery.getSnapshot().copies.find(c=>c.reason==='Primeira cópia').durable,false);
});

function largeFixture(load) {
  const d=fixture(load);d.company.name='Planejamento volumoso';
  d.assignments=Array.from({length:110},()=>({...d.assignments[0],id:crypto.randomUUID(),tags:Array.from({length:50},()=> 'a'.repeat(256))}));
  assert.ok(Buffer.byteLength(JSON.stringify(d),'utf8')>load('lib/nativeDocument.ts').MAX_NATIVE_BYTES);
  return d;
}
test('a saved browser document above 1 MiB reopens in a fresh session with preferences intact',()=>{
  const storage=memory(),{load}=session(storage),d=largeFixture(load);
  const {useScheduleStore:store}=load('store/scheduleStore.ts');
  store.getState().setDocument(d);store.getState().setTheme('dark');store.getState().setViewMode('month');
  assert.equal(load('lib/recoveryStorage.ts').recovery.getSnapshot().phase,'saved');
  const expected=plain(store.getState().document);
  const fresh=session(storage),{useScheduleStore:reloaded}=fresh.load('store/scheduleStore.ts');
  assert.deepEqual(plain(reloaded.getState().document),expected);
  assert.equal(reloaded.getState().theme,'dark');assert.equal(reloaded.getState().viewMode,'month');
  assert.equal(fresh.load('lib/recoveryStorage.ts').recovery.getSnapshot().phase,'saved');
  assert.equal(fresh.load('lib/recoveryStorage.ts').recovery.getSnapshot().protected,false);
  assert.throws(()=>fresh.load('lib/nativeDocument.ts').serializeNative(reloaded.getState().document),/1 MiB/);
});
test('legacy oversized primary documents reopen without modifying the original bytes',()=>{
  const storage=memory(),{load}=session(storage),d=largeFixture(load),raw=saved(d);
  storage.setItem('escalalivre-state',raw);
  const fresh=session(storage),{recovery}=fresh.load('lib/recoveryStorage.ts');
  assert.deepEqual(plain(recovery.storage.getItem('escalalivre-state').state.document),plain(d));
  assert.equal(storage.getItem('escalalivre-state'),raw);assert.equal(recovery.getSnapshot().phase,'saved');
});
test('oversized checkpoints support automatic recovery and manual restore across sessions',()=>{
  const storage=memory(),{load}=session(storage),d=largeFixture(load);
  const {useScheduleStore:store}=load('store/scheduleStore.ts');store.getState().setDocument(d);
  const expected=plain(store.getState().document);
  assert.equal(store.getState().importDocument(fixture(load)),true);
  const fresh=session(storage),{useScheduleStore:reloaded}=fresh.load('store/scheduleStore.ts'),{recovery}=fresh.load('lib/recoveryStorage.ts');
  const copy=recovery.getSnapshot().copies.find(c=>c.reason==='Antes da importação');
  assert.ok(copy.restorable&&copy.durable);assert.equal(copy.native,false);
  assert.equal(reloaded.getState().restoreRecovery(copy.contents),true);
  assert.deepEqual(plain(reloaded.getState().document),expected);
  const corrupted=memory({'escalalivre-state':'broken JSON','escalalivre-recovery':JSON.stringify({version:1,copies:[{contents:copy.contents,reason:'Antes da importação'}]})});
  const next=session(corrupted),{useScheduleStore:recovered}=next.load('store/scheduleStore.ts');
  assert.deepEqual(plain(recovered.getState().document),expected);
  assert.equal(next.load('lib/recoveryStorage.ts').recovery.getSnapshot().protected,true);
});
test('invalid writes cannot replace a readable document or report saved',()=>{
  const storage=memory(),{load}=session(storage),{recovery}=load('lib/recoveryStorage.ts'),d=fixture(load),raw=saved(d);
  storage.setItem('escalalivre-state',raw);recovery.storage.getItem('escalalivre-state');
  d.employees=null;assert.doesNotThrow(()=>recovery.storage.setItem('escalalivre-state',{version:2,state:{document:d}}));
  assert.equal(recovery.getSnapshot().phase,'write-error');assert.equal(storage.getItem('escalalivre-state'),raw);
});
test('retry offers an oversized document rediscovered after a read failure before overwrite',()=>{
  const storage=memory(),{load}=session(storage),d=largeFixture(load),raw=saved(d);
  storage.setItem('escalalivre-state',raw);const get=storage.getItem;let denied=true;
  storage.getItem=key=>{if(denied&&key==='escalalivre-state')throw new Error('Denied');return get(key);};
  const {useScheduleStore:store}=load('store/scheduleStore.ts'),{recovery}=load('lib/recoveryStorage.ts');
  denied=false;assert.equal(store.getState().retryStorage(),false);assert.equal(storage.getItem('escalalivre-state'),raw);
  const copy=recovery.getSnapshot().copies.find(c=>c.reason==='Documento reencontrado no navegador');assert.ok(copy.restorable);
  assert.equal(store.getState().restoreRecovery(copy.contents),true);assert.equal(store.getState().document.company.name,d.company.name);
});

test('invalid collections in files at the byte limit reject without changing the current planning',async()=>{
  const storage=memory(),{load}=session(storage),native=load('lib/nativeDocument.ts');
  const {useScheduleStore:store}=load('store/scheduleStore.ts');
  store.getState().setDocument(fixture(load));
  const previous=plain(store.getState().document),savedBytes=storage.getItem('escalalivre-state');
  const bad=fixture(load);bad.assignments=Array(20001).fill(null);bad.company.name='Ação 日本語 😀';
  const text=JSON.stringify(bad),nearLimit=text+' '.repeat(native.MAX_NATIVE_BYTES-native.nativeBytes(text));
  assert.equal(native.nativeBytes(nearLimit),native.MAX_NATIVE_BYTES);
  await assert.rejects(async()=>store.getState().importDocument(await native.readNativeFile({size:native.MAX_NATIVE_BYTES,text:async()=>nearLimit})),/inválido/);
  assert.throws(()=>native.parseNativeText(nearLimit+' '),/1 MiB/);
  assert.deepEqual(plain(store.getState().document),previous);
  assert.equal(storage.getItem('escalalivre-state'),savedBytes);
});

test('oversized invalid browser collections preserve saved bytes, live planning and recovery originals',()=>{
  const storage=memory(),{load}=session(storage),native=load('lib/nativeDocument.ts');
  const {useScheduleStore:store}=load('store/scheduleStore.ts'),{recovery}=load('lib/recoveryStorage.ts');
  store.getState().setDocument(fixture(load));
  const previous=plain(store.getState().document),savedBytes=storage.getItem('escalalivre-state');
  const bad=fixture(load);bad.employees=Array(201).fill(null);bad.extra='x'.repeat(native.MAX_NATIVE_BYTES);
  const contents=JSON.stringify(bad);assert.ok(native.nativeBytes(contents)>native.MAX_NATIVE_BYTES);
  assert.throws(()=>store.getState().importDocument(bad),/inválido/);
  assert.throws(()=>store.getState().restoreRecovery(contents),/inválido/);
  recovery.storage.setItem('escalalivre-state',{version:2,state:{document:bad}});
  assert.equal(recovery.getSnapshot().phase,'write-error');
  assert.equal(storage.getItem('escalalivre-state'),savedBytes);
  assert.deepEqual(plain(store.getState().document),previous);
  const corrupt=saved(bad);
  storage.setItem('escalalivre-state',corrupt);
  storage.setItem('escalalivre-recovery',JSON.stringify({version:1,copies:[{contents:JSON.stringify(previous),reason:'Cópia válida'}]}));
  const fresh=session(storage),{useScheduleStore:restored}=fresh.load('store/scheduleStore.ts');
  assert.deepEqual(plain(restored.getState().document),previous);
  const status=fresh.load('lib/recoveryStorage.ts').recovery.getSnapshot();
  assert.equal(status.protected,true);
  assert.ok(status.copies.some(copy=>copy.contents===corrupt&&copy.original));
  assert.equal(storage.getItem('escalalivre-state'),corrupt);
});

test('Zod upgrade preserves Guid formats, optional/null fields and civil/duration migrations across native and browser recovery',()=>{
  const {load}=session(memory()),native=load('lib/nativeDocument.ts'),{parseRecoveryDocument}=load('lib/recoveryStorage.ts');
  const d=fixture(load);d.id='11111111-1111-1111-1111-111111111111';
  d.company.defaultWorkload.defaultShiftDuration='1.00:00:00';
  d.company.minimumRest='1.00:00:00';
  d.company.coverage[0].daysMode=null;
  d.assignments[0].break=null;
  d.assignments[0].start='2026-05-18T22:00:01';d.assignments[0].end='2026-05-19T06:00:02';
  delete d.company.holidays;delete d.company.middayClosure;
  delete d.employees[0].shiftStartsAt;delete d.employees[0].fixedInterval;
  const canonical=native.parseNativeText(JSON.stringify(d));
  assert.equal(canonical.id,d.id);
  assert.equal(canonical.company.defaultWorkload.defaultShiftDuration,'24:00:00');
  assert.equal(canonical.company.minimumRest,'24:00:00');
  assert.equal(canonical.company.coverage[0].daysMode,undefined);
  assert.equal(canonical.assignments[0].break,undefined);
  assert.equal(canonical.assignments[0].start,d.assignments[0].start);
  assert.equal(canonical.assignments[0].end,d.assignments[0].end);
  assert.deepEqual(plain(parseRecoveryDocument(JSON.stringify(d))),plain(canonical));
  assert.deepEqual(plain(native.parseNativeText(native.serializeNative(canonical))),plain(canonical));
  for(const invalid of ['00000000-0000-0000-0000-000000000000','not-a-guid'])
    assert.throws(()=>native.validateNativeDocument({...d,id:invalid}),/inválido/);
  const unsupported=fixture(load);unsupported.employees[0].fixedInterval=null;
  assert.throws(()=>native.validateNativeDocument(unsupported),/inválido/);
});
