const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./source-loader.cjs')();
const {normalizeDocument,migrateDocument,DOCUMENT_MIGRATIONS}=load('lib/documentLifecycle.ts');
const {canCover,coverageAllocation}=load('lib/coverageAllocation.ts');
const {serializeNative,parseNativeText}=load('lib/nativeDocument.ts');
const {sampleDocument}=load('data/sample.ts');
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture() {
  const document=normalizeDocument(migrateDocument(structuredClone(sampleDocument)).document);
  const role=document.roles.find(role=>role.name==='caixa');
  document.employees=[{...document.employees[0],coverageRoleIds:[role.id],coverageRoles:['caixa']}];
  const employee=document.employees[0];
  document.assignments=[{...document.assignments[0],employeeId:employee.id,role:employee.role,roleId:employee.roleId,start:'2026-10-14T08:00:00',end:'2026-10-14T12:00:00',break:undefined}];
  const rule={role:role.name,roleId:role.id,day:3,start:'08:00:00',end:'12:00:00',minimumEmployees:1};
  document.company.coverage=[rule];
  return {document,employee,role,rule};
}
test('unchecking and saving revokes coverage through normalization, allocation and native reload',()=>{
  const {document,employee,rule}=fixture();
  const {useScheduleStore:store}=load('store/scheduleStore.ts');
  store.getState().setDocument(document);
  assert.ok(canCover(store.getState().document.employees[0],rule));
  store.getState().upsertEmployee({...employee,coverageRoleIds:[]});
  const saved=store.getState().document;
  assert.deepEqual(plain(saved.employees[0].coverageRoles),[]);
  for(const current of [saved,normalizeDocument(saved),parseNativeText(serializeNative(saved))]) {
    assert.deepEqual(plain(current.employees[0].coverageRoleIds),[]);
    assert.deepEqual(plain(current.employees[0].coverageRoles),[]);
    assert.equal(canCover(current.employees[0],rule),false);
    assert.equal(coverageAllocation(current,Date.parse('2026-10-14T08:00:00'),Date.parse('2026-10-14T12:00:00'),[rule])[0].assigned,0);
  }
});
test('legacy names migrate to unique IDs once, including roles absent from the catalog',()=>{
  const {document,employee,role,rule}=fixture();
  delete employee.coverageRoleIds;
  employee.coverageRoles=[' caixa ','Caixa','Segurança'];
  const before=JSON.stringify(document);
  const migration=migrateDocument(document);
  assert.equal(JSON.stringify(document),before);
  assert.ok(migration.applied.includes(DOCUMENT_MIGRATIONS.coverageRoles));
  const migrated=normalizeDocument(migration.document);
  assert.equal(migrated.employees[0].coverageRoleIds.length,2);
  assert.equal(migrated.employees[0].coverageRoleIds[0],role.id);
  assert.ok(migrated.roles.some(r=>r.name==='Segurança'));
  assert.ok(canCover(migrated.employees[0],rule));
  assert.deepEqual(plain(migrateDocument(migrated).applied),[]);
  assert.deepEqual(plain(normalizeDocument(migrated)),plain(migrated));
  const restored=parseNativeText(serializeNative(document));
  assert.ok(canCover(restored.employees[0],rule));
});
test('explicit empty or unknown IDs never recover stale names during import or calculation',()=>{
  for(const ids of [[],[crypto.randomUUID()]]) {
    const {document,employee,rule}=fixture();
    employee.coverageRoleIds=ids;
    assert.equal(canCover(employee,rule),false);
    const restored=parseNativeText(serializeNative(document));
    assert.deepEqual(plain(restored.employees[0].coverageRoleIds),ids);
    assert.deepEqual(plain(restored.employees[0].coverageRoles),[]);
    assert.equal(canCover(restored.employees[0],rule),false);
  }
});
test('role renames replace derived names and removing one authorization preserves the others',()=>{
  const {document,employee,role}=fixture();
  const other={id:crypto.randomUUID(),name:'Estoque'};document.roles.push(other);
  employee.coverageRoleIds=[role.id,other.id];
  role.name='Operador de caixa';
  const renamed=normalizeDocument(document);
  assert.deepEqual(plain(renamed.employees[0].coverageRoles),['Operador de caixa','Estoque']);
  renamed.employees[0].coverageRoleIds=[other.id];
  const removed=normalizeDocument(renamed);
  assert.deepEqual(plain(removed.employees[0].coverageRoles),['Estoque']);
  assert.equal(canCover(removed.employees[0],{role:role.name,roleId:role.id}),false);
  assert.equal(canCover(removed.employees[0],{role:other.name,roleId:other.id}),true);
});
