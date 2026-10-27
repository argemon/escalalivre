const {test}=require('node:test'),assert=require('node:assert/strict');
const load=require('./source-loader.cjs')();
const {regimeTypes}=load('types/schedule.ts');
const {regimeDefinition,regimeConstraints,regimeChoices}=load('lib/regimes.ts');
const {documentSchema}=load('lib/documentSchema.ts');
const {sampleDocument}=load('data/sample.ts');
const plain=value=>JSON.parse(JSON.stringify(value));

test('product choices, schema and descriptors expose exactly the two existing regimes',()=>{
 assert.deepEqual(plain(regimeTypes),['dayBased','hourBased']);
 assert.deepEqual(plain(regimeChoices),[{type:'dayBased',label:'Ciclo em dias'},{type:'hourBased',label:'Ciclo em horas'}]);
 for(const type of regimeTypes){
  const doc=structuredClone(sampleDocument);doc.company.defaultWorkload.regimeType=type;
  assert.equal(documentSchema.safeParse(doc).success,true);
  assert.ok(regimeDefinition(type).workLabel);assert.ok(regimeDefinition(type).restLabel);
 }
});
for(const type of ['testCombined','unregistered','DAYBASED','dayBased ','constructor','__proto__'])test('unknown regime stays outside product schema and descriptors: '+type,()=>{
 assert.throws(()=>regimeDefinition(type),/Regime desconhecido/);
 for(const owner of ['company','employee']){
  const doc=structuredClone(sampleDocument);
  (owner==='company'?doc.company.defaultWorkload:doc.employees[0].workload).regimeType=type;
  assert.equal(documentSchema.safeParse(doc).success,false);
 }
});
test('regime capabilities keep days distinct from work/rest hours including explicit zero',()=>{
 const rule={regimeType:'dayBased',workUnits:5,restUnits:2,weeklyLimitHours:43.75,defaultShiftDuration:'25:00:01'};
 assert.deepEqual(plain(regimeConstraints(rule)),{rollingCycle:{workDays:5,restDays:2}});
 assert.deepEqual(plain(regimeConstraints({...rule,regimeType:'hourBased',workUnits:24,restUnits:36})),{maximumWorkMillis:86400000,restMillis:129600000});
 assert.equal(regimeConstraints({...rule,regimeType:'hourBased',restUnits:0}).restMillis,0);
 assert.equal(regimeConstraints(rule).restMillis,undefined);
 assert.equal(regimeDefinition('dayBased').shortLabel,'DAY_BASED');
 assert.equal(regimeDefinition('hourBased').shortLabel,'HOUR_BASED');
});
