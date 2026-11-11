const {test}=require('node:test');
const assert=require('node:assert/strict');
const loader=require('./source-loader.cjs');
const plain=v=>JSON.parse(JSON.stringify(v));
function fixture(){const load=loader();const {sampleDocument}=load('data/sample.ts');const {migrateDocument,normalizeDocument}=load('lib/documentLifecycle.ts');return {load,d:normalizeDocument(migrateDocument(structuredClone(sampleDocument)).document),ops:load('lib/teamOperations.ts')};}
test('duplicate allowlist gives new identity, retains recurring values, omits dated and unknown personal fields',()=>{
 const {d,ops}=fixture();const e={...d.employees[0],preferences:[{code:'opening',weight:-7,description:'Legacy'}],contractLeaves:[{date:'2026-11-11',excusedSeconds:3600}],inactiveFrom:'2027-01-01',futureHistory:[1],availability:[{start:'x',end:'y'}],restrictions:[{start:'x',end:'y'}]};
 const before=plain(e),copy=ops.duplicateEmployee(e,crypto.randomUUID(),' Nova pessoa ');assert.notEqual(copy.id,e.id);assert.equal(copy.name,'Nova pessoa');assert.deepEqual(plain(copy.availability),[]);assert.deepEqual(plain(copy.restrictions),[]);for(const k of ['contractLeaves','inactiveFrom','futureHistory'])assert.equal(copy[k],undefined);assert.deepEqual(plain(copy.preferences),before.preferences);copy.preferences[0].weight=9;assert.deepEqual(plain(e),before);assert.throws(()=>ops.duplicateEmployee(e,'new',' '));
});
test('batch previews are immutable, selected fields only, atomic and stale confirmations fail',()=>{
 const {d,ops,load}=fixture();d.employees[0].allowsOvertime=true;d.employees[1].allowsOvertime=false;const before=plain(d);
 const p=ops.previewTeamBatch(d,[d.employees[1].id],d.employees[0].id,['allowsOvertime']);assert.deepEqual(plain(d),before);assert.equal(p.document.employees[1].allowsOvertime,true);assert.deepEqual(plain(p.document.assignments),before.assignments);
 const next=ops.confirmTeamPreview(d,p);assert.deepEqual(plain(next.employees[1]),{...before.employees[1],allowsOvertime:true});assert.throws(()=>ops.confirmTeamPreview({...d,updatedAt:'changed'},p));assert.throws(()=>ops.previewTeamBatch(d,[d.employees[1].id],d.employees[0].id,['roleId']));
 const {useScheduleStore:store}=load('store/scheduleStore.ts');store.getState().setDocument(d);const current=store.getState().document;const valid=ops.previewTeamBatch(current,[current.employees[1].id],current.employees[0].id,['allowsOvertime']);store.getState().applyTeamPreview(valid);assert.deepEqual(plain(store.getState().document.assignments),before.assignments);
});
test('CSV handles BOM, escaped quotes, quoted newline and refuses malformed or excessive input',()=>{
 const {ops}=fixture();const rows=ops.parseTeamCsv('\uFEFFnome;funcao;modelo\r\n"Ana; \""A\""";Atendente;5x2\r\n'.replaceAll('\\"','"'));assert.equal(rows.length,2);assert.equal(rows[1][0],'Ana; "A"');assert.throws(()=>ops.parseTeamCsv('"não fechado'));assert.throws(()=>ops.parseTeamCsv('nome;funcao;modelo\n'+('x;y;5x2\n'.repeat(201))));assert.throws(()=>ops.parseTeamCsv('x'.repeat(2097153)));
});
test('import previews errors per row, requires duplicate acknowledgement, excludes explicitly, and never overwrites',()=>{
 const {d,ops}=fixture();const rows=[['nome','funcao','modelo'],['Nova',d.roles[0].name,'5x2'],[d.employees[0].name,d.roles[0].name,'empresa'],['Erro','Não cadastrada','6x1']];let seq=0;
 const before=plain(d),lines=ops.previewTeamImport(d,rows,()=> crypto.randomUUID());assert.equal(lines[0].error,undefined);assert.equal(lines[1].duplicate,true);assert.ok(lines[2].error);assert.throws(()=>ops.confirmTeamImport(d,JSON.stringify(d),lines));lines[2].excluded=true;assert.throws(()=>ops.confirmTeamImport(d,JSON.stringify(d),lines));lines[1].acknowledged=true;
 const next=ops.confirmTeamImport(d,JSON.stringify(d),lines);assert.equal(next.employees.length,d.employees.length+2);assert.deepEqual(plain(d),before);assert.deepEqual(plain(next.employees.slice(0,d.employees.length)),before.employees);assert.deepEqual(plain(next.assignments),before.assignments);assert.throws(()=>ops.confirmTeamImport({...d,updatedAt:'changed'},JSON.stringify(d),lines));
});
test('custom legacy preference weights survive native roundtrip and batch',()=>{
 const {d,ops,load}=fixture();d.employees[0].preferences=[{code:'opening',description:'legado',weight:-37},{code:'closing',description:'legado',weight:173}];const {serializeNative,parseNativeText}=load('lib/nativeDocument.ts');const parsed=parseNativeText(serializeNative(d));assert.deepEqual(plain(parsed.employees[0].preferences),plain(d.employees[0].preferences));const preview=ops.previewTeamBatch(parsed,[parsed.employees[1].id],parsed.employees[0].id,['preferences']);assert.deepEqual(plain(preview.document.employees[1].preferences),plain(d.employees[0].preferences));
});
