const {test}=require('node:test');
const assert=require('node:assert/strict');
const sourceLoader=require('./source-loader.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture() {
  const load=sourceLoader();
  const {sampleDocument}=load('data/sample.ts');
  const {useScheduleStore:store}=load('store/scheduleStore.ts');
  const {normalizeDocument,migrateDocument}=load('lib/documentLifecycle.ts');
  const document=normalizeDocument(migrateDocument(structuredClone(sampleDocument)).document);
  const employee=document.employees.find(e=>e.role==='vendedor');
  const other=document.employees.find(e=>e.id!==employee.id);
  document.planningPeriod={start:'2026-10-19',end:'2026-10-25'};
  const base=document.assignments.find(a=>a.employeeId===employee.id);
  document.assignments=['2026-10-18','2026-10-19','2026-10-25','2026-10-26'].map(date=>({
    ...base,id:crypto.randomUUID(),employeeId:employee.id,role:employee.role,roleId:employee.roleId,
    start:date+'T22:00:00',end:new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10)+'T06:00:00',
    break:{start:date+'T23:00:00',end:date+'T23:30:00'},tags:['original'],source:'manual',
  }));
  document.assignments.push({...document.assignments[0],id:crypto.randomUUID(),employeeId:other.id,role:other.role,roleId:other.roleId});
  store.getState().setDocument(document);
  return {load,store,employee:store.getState().document.employees.find(e=>e.id===employee.id)};
}
test('changing employee role updates name and ID together on every registered shift',()=>{
  const {load,store,employee}=fixture();
  const before=plain(store.getState().document);
  const role=before.roles.find(r=>r.name==='caixa');
  store.getState().upsertEmployee({...employee,roleId:role.id,role:role.name});
  const saved=store.getState().document;
  assert.equal(saved.employees.find(e=>e.id===employee.id).roleId,role.id);
  for(const shift of saved.assignments) {
    const original=before.assignments.find(a=>a.id===shift.id);
    assert.deepEqual(plain(shift),shift.employeeId===employee.id?{...original,roleId:role.id,role:role.name}:original);
  }
  assert.ok(!store.getState().analysis.conflicts.some(c=>c.code==='invalidShift'&&c.employeeId===employee.id));
  const {normalizeDocument}=load('lib/documentLifecycle.ts');
  const {serializeNative,parseNativeText}=load('lib/nativeDocument.ts');
  for(const document of [normalizeDocument(saved),parseNativeText(serializeNative(saved))]) {
    for(const shift of document.assignments.filter(a=>a.employeeId===employee.id)) {
      assert.equal(shift.roleId,role.id);assert.equal(shift.role,role.name);
    }
  }
});
test('editing an employee without changing role preserves shift contents',()=>{
  const {store,employee}=fixture();
  const before=plain(store.getState().document.assignments);
  store.getState().upsertEmployee({...employee,name:'Nome atualizado'});
  assert.deepEqual(plain(store.getState().document.assignments),before);
});
test('a new role without an ID is resolved once and shared by the employee and shifts',()=>{
  const {store,employee}=fixture();
  store.getState().upsertEmployee({...employee,roleId:undefined,role:'Supervisor'});
  const document=store.getState().document;
  const updated=document.employees.find(e=>e.id===employee.id);
  assert.ok(updated.roleId);
  assert.equal(updated.role,'Supervisor');
  for(const shift of document.assignments.filter(a=>a.employeeId===employee.id)) {
    assert.equal(shift.roleId,updated.roleId);assert.equal(shift.role,updated.role);
  }
  assert.ok(!store.getState().analysis.conflicts.some(c=>c.code==='invalidShift'&&c.employeeId===employee.id));
});
