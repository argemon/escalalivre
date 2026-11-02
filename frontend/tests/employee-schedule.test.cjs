const {test}=require('node:test'),assert=require('node:assert/strict');
const load=require('./source-loader.cjs')();
const {selectEmployeePattern,selectEmployeeDays}=load('lib/policies/employeeSchedule.ts');
const {sampleDocument}=load('data/sample.ts'),{documentSchema}=load('lib/documentSchema.ts');
const plain=v=>JSON.parse(JSON.stringify(v));
test('selecting 5x2 or 6x1 creates individual automatic days without copying company opening days',()=>{
 const doc=documentSchema.parse(structuredClone(sampleDocument)),before=plain(doc);
 doc.company.operatingDays=[0,1,2,3,4,5,6];
 for(const days of [5,6]){
  const e=selectEmployeePattern(doc.employees[0],doc.company,days);
  assert.equal(e.inheritsCompanyDefaults,false);assert.equal(e.workingDays,undefined);
  assert.equal(e.workload.workUnits,days);assert.equal(e.workload.restUnits,7-days);
  assert.equal(e.workload.weeklyPlan.flexibleWorkDays,days);
  assert.equal(e.workload.weeklyPlan.contractedSeconds,(days===5?40:44)*3600);
 }
 assert.deepEqual(plain(doc.assignments),before.assignments);
});
test('switching automatic/fixed days preserves contracted amount, maximum and explicit compensation',()=>{
 const doc=documentSchema.parse(structuredClone(sampleDocument));
 let e=selectEmployeePattern(doc.employees[0],doc.company,5);
 e.workload.weeklyLimitHours=48;e.workload.weeklyPlan.compensation={instrument:'Acordo',startsOn:'2026-01-01',endsOn:'2026-12-31'};
 const fixed=selectEmployeeDays(e,doc.company,false),automatic=selectEmployeeDays(fixed,doc.company,true);
 assert.equal(fixed.workingDays.length,5);assert.equal(fixed.workload.weeklyPlan.flexibleWorkDays,undefined);
 assert.equal(fixed.workload.weeklyPlan.dailySeconds.reduce((a,b)=>a+b),144000);
 assert.equal(automatic.workingDays,undefined);assert.equal(automatic.workload.weeklyPlan.flexibleWorkDays,5);
 assert.equal(automatic.workload.weeklyLimitHours,48);assert.deepEqual(plain(automatic.workload.weeklyPlan.compensation),plain(e.workload.weeklyPlan.compensation));
});
test('floating plan survives native save; invalid workday counts are rejected',()=>{
 const {serializeNative,parseNativeText}=load('lib/nativeDocument.ts');
 const doc=documentSchema.parse(structuredClone(sampleDocument)),before=plain(doc.assignments);
 doc.employees[0]=selectEmployeePattern(doc.employees[0],doc.company,5);
 const restored=parseNativeText(serializeNative(doc));assert.equal(restored.employees[0].workload.weeklyPlan.flexibleWorkDays,5);
 assert.deepEqual(plain(restored.assignments),before);
 for(const bad of [0,8,1.5]){doc.employees[0].workload.weeklyPlan.flexibleWorkDays=bad;assert.equal(documentSchema.safeParse(doc).success,false);}
});
test('floating schedule does not invent daily preview shifts before generation',()=>{
 const {weeklyCoverage}=load('lib/weeklyCoverage.ts');const doc=documentSchema.parse(structuredClone(sampleDocument));
 doc.employees=[selectEmployeePattern(doc.employees[0],doc.company,5)];doc.assignments=[];
 assert.deepEqual(plain(weeklyCoverage(doc,doc.planningPeriod.start)),[]);
});
test('an incompatible company calendar stays editable when selecting fixed days',()=>{
 const doc=documentSchema.parse(structuredClone(sampleDocument));doc.company.operatingDays=[1];
 const employee=selectEmployeePattern(doc.employees[0],doc.company,5),fixed=selectEmployeeDays(employee,doc.company,false);
 assert.equal(fixed.workload.weeklyPlan.contractedSeconds,144000);assert.deepEqual(plain(fixed.workingDays),[1]);
 assert.equal(documentSchema.safeParse({...doc,employees:[fixed],assignments:[]}).success,true);
});
test('real pattern selector offers company/5x2/6x1 and switches between automatic and fixed days',()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
 const states=[];let cursor=0;const react={useState(v){const i=cursor++;if(!(i in states))states[i]=v;return [states[i],n=>states[i]=n];}};
 const exports={};const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/components/EmployeeScheduleEditor.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(code,{exports,require:r=>r==='react'?react:r.startsWith('../lib/')?load(r.replace('../','')+'.ts'):require(r)});
 const doc=documentSchema.parse(structuredClone(sampleDocument));let e=doc.employees[0];
 const render=()=>{cursor=0;return exports.EmployeeScheduleEditor({employee:e,company:doc.company,end:'2026-11-14',onChange:v=>e=v});};
 const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)];
 let tree=render();assert.equal(nodes(tree).find(n=>n.type==='select').props.value,'company');
 nodes(tree).find(n=>n.type==='select').props.onChange({target:{value:'5'}});
 assert.equal(e.inheritsCompanyDefaults,false);assert.equal(e.workload.weeklyPlan.flexibleWorkDays,5);
 tree=render();nodes(tree).find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:false}});
 assert.equal(e.workload.weeklyPlan.flexibleWorkDays,undefined);assert.equal(e.workingDays.length,5);
 tree=render();nodes(tree).find(n=>n.type==='select').props.onChange({target:{value:'5'}});
 tree=render();nodes(tree).find(n=>n.type==='select').props.onChange({target:{value:'custom'}});
 assert.equal(e.workload.weeklyPlan.flexibleWorkDays,undefined);assert.ok(e.workingDays?.length);
});
