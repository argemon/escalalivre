const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./source-loader.cjs')();
const {documentSchema}=load('lib/documentSchema.ts');
const limits=require('../../shared/document-validation-limits.json');
const fixture=()=>structuredClone(load('data/sample.ts').sampleDocument);
const collections=[
  ['employees',d=>d,'employees',limits.employees],
  ['assignments',d=>d,'assignments',limits.assignments],
  ['roles',d=>d,'roles',limits.roles],
  ['coverage',d=>d.company,'coverage',limits.coverage],
  ['holidays',d=>d.company,'holidays',limits.holidays],
  ['operatingDays',d=>d.company,'operatingDays',limits.days],
  ...['availability','restrictions'].map(key=>[key,d=>d.employees[0],key,limits.windows]),
  ['preferences',d=>d.employees[0],'preferences',limits.preferences],
  ...['coverageRoles','coverageRoleIds'].map(key=>[key,d=>d.employees[0],key,limits.coverageRoles]),
  ...['preferredDaysOff','workingDays'].map(key=>[key,d=>d.employees[0],key,limits.days]),
  ['tags',d=>d.assignments[0],'tags',limits.tags]
];
for(const [name,parent,key,max] of collections)test('rejects oversized collection before reading elements: '+name,()=>{
  const doc=fixture(),values=new Array(max+1);
  Object.defineProperty(values,0,{get(){throw new Error('Element must not be read');}});
  parent(doc)[key]=values;
  let result;
  assert.doesNotThrow(()=>{result=documentSchema.safeParse(doc);});
  assert.equal(result.success,false);
  assert.equal(result.error.issues.length,1);
});

test('invalid elements in collections within their count limits produce bounded diagnostics',()=>{
  for(const [name,parent,key,max] of collections) {
    const doc=fixture();parent(doc)[key]=Array.from({length:max},()=>null);
    let result;
    assert.doesNotThrow(()=>{result=documentSchema.safeParse(doc);},name);
    assert.equal(result.success,false,name);
    assert.ok(result.error.issues.length<=2,name+': '+result.error.issues.length);
  }
});
