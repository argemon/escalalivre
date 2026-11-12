const {test}=require('node:test'),assert=require('node:assert/strict');
const sourceLoader=require('./source-loader.cjs'),load=sourceLoader();
const policy=load('lib/policies/weeklyWorkPlan.ts'),plain=v=>JSON.parse(JSON.stringify(v));
const shared=require('../../shared/weekly-work-plan-scenarios.json');
for(const s of shared.scenarios)test('weekly work parity: '+s.id,()=>{
 const plan=s.custom?{contractedSeconds:s.seconds,dailySeconds:s.custom}:policy.distributeWeekly(s.seconds,s.days,s.friday);
 if(s.compensation)plan.compensation={instrument:'Acordo',startsOn:'2026-01-01',endsOn:'2026-12-31'};
 assert.deepEqual(plain(plan.dailySeconds),s.expected);assert.deepEqual(plain(policy.weeklyPlanIssues(plan,s.ceiling??44)),s.issues);
});
for(const s of shared.exits)test('weekly work exit: '+s.expected,()=>assert.equal(policy.plannedExit('07:30:00',s.work,3600),s.expected));
const {sampleDocument}=load('data/sample.ts'),{documentSchema}=load('lib/documentSchema.ts');
const {migrateDocument}=load('lib/documentLifecycle.ts');
const {serializeNative,parseNativeText}=load('lib/nativeDocument.ts');
test('legacy has no inferred load; new canonical plan round trips with conflicts and preserves shifts',()=>{
 const doc=documentSchema.parse(structuredClone(sampleDocument)),before=plain(doc.assignments);
 assert.equal(doc.company.defaultWorkload.weeklyPlan,undefined);
 doc.company.defaultWorkload.weeklyPlan={contractedSeconds:158400,dailySeconds:[0,1,2,3,4,5,6]};
 const parsed=parseNativeText(serializeNative(doc));
 assert.deepEqual(plain(parsed.company.defaultWorkload.weeklyPlan),plain(doc.company.defaultWorkload.weeklyPlan));
 assert.deepEqual(plain(parsed.assignments),before);
 const once=migrateDocument(parsed),twice=migrateDocument(once.document);
 assert.deepEqual(plain(twice.applied),[]);assert.deepEqual(plain(twice.document),plain(once.document));
 for(const dailySeconds of [[1],[-1,0,0,0,0,0,0],[0.5,0,0,0,0,0,0]]) {
  const bad=structuredClone(doc);bad.company.defaultWorkload.weeklyPlan.dailySeconds=dailySeconds;
  assert.equal(documentSchema.safeParse(bad).success,false);
 }
});
test('company and individual configuration saves preserve all shift fields and resolve inheritance',()=>{
 const {useScheduleStore:store}=load('store/scheduleStore.ts');store.getState().setDocument(documentSchema.parse(structuredClone(sampleDocument)));
 const before=plain(store.getState().document.assignments),plan=policy.distributeWeekly(158400,[1,2,3,4,5]);
 let doc=store.getState().document;store.getState().setDocument({...doc,company:{...doc.company,defaultWorkload:{...doc.company.defaultWorkload,weeklyPlan:plan}}});
 doc=store.getState().document;const employee=doc.employees[0];
 assert.deepEqual(plain(policy.planFor(doc.company,{...employee,inheritsCompanyDefaults:true})),plain(plan));
 const own=policy.distributeWeekly(144000,[1,2,3,4,5]);store.getState().upsertEmployee({...employee,inheritsCompanyDefaults:false,workload:{...employee.workload,weeklyPlan:own}});
 assert.deepEqual(plain(store.getState().document.assignments),before);
 assert.deepEqual(plain(policy.planFor(doc.company,store.getState().document.employees.find(e=>e.id===employee.id))),plain(own));
 assert.equal(policy.hasContractPlans(store.getState().document),true);
});

test('interval presentation distinguishes fixed duration and permitted range',()=>{
 assert.equal(policy.intervalDescription({minimum:'01:00:00',maximum:'01:00:00'}),'Duração fixa: 01:00');
 assert.equal(policy.intervalDescription({minimum:'01:00:00',maximum:'02:00:00'}),'Faixa permitida: 01:00–02:00');
});
// Render the real editor and drive its public controls without a browser or solver.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function editorLoader() {
 const states=[],cache=new Map();let cursor=0;
 const react={...require('react'),useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],v=>states[i]=v];}};
 function component(file){
  if(cache.has(file))return cache.get(file);
  const exports={};cache.set(file,exports);
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code,{exports,require:r=>r==='react'?react:r.startsWith('.')?component(path.posix.normalize(path.posix.join(path.posix.dirname(file),r))+(fs.existsSync(path.join(__dirname,'../src',path.posix.join(path.posix.dirname(file),r)+'.tsx'))?'.tsx':'.ts')):require(r)});return exports;
 }
 const Editor=component('components/WeeklyWorkPlanEditor.tsx').WeeklyWorkPlanEditor;
 return props=>{cursor=0;return Editor(props);};
}
function nodes(node){return !node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(nodes)];}
test('editor applies both presets to canonical days, previews exits and distinguishes compensation from extras',()=>{
 const render=editorLoader();let value;const props=()=>({value,onChange:v=>value=v,ceiling:44,entry:'07:30:00',pause:'01:00:00'});
 let tree=render(props());nodes(tree).find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});
 value={...value,contractedSeconds:158400};tree=render(props());
 nodes(tree).find(n=>n.type==='select').props.onChange({target:{value:'uniform'}});tree=render(props());
 nodes(tree).find(n=>n.type==='button').props.onClick();assert.deepEqual(plain(value.dailySeconds),[0,31680,31680,31680,31680,31680,0]);
 tree=render(props());assert.ok(JSON.stringify(tree).includes('17:18:00'));assert.ok(JSON.stringify(tree).includes('falta de carga'));
 nodes(tree).find(n=>n.type==='select').props.onChange({target:{value:'friday'}});tree=render(props());nodes(tree).find(n=>n.type==='button').props.onClick();
 assert.deepEqual(plain(value.dailySeconds),[0,32400,32400,32400,32400,28800,0]);
 tree=render(props());assert.ok(JSON.stringify(tree).includes('17:30:00'));assert.ok(JSON.stringify(tree).includes('16:30:00'));
 nodes(tree).filter(n=>n.type==='input'&&n.props.type==='checkbox').at(-1).props.onChange({target:{checked:true}});
 assert.ok(value.compensation);assert.equal(value.allowsOvertime,undefined);
});

for(const s of shared.compensationDates)test('compensation validity: '+s.date,()=>{
 const plan={contractedSeconds:158400,dailySeconds:[0,31680,31680,31680,31680,31680,0],compensation:{instrument:'Acordo',startsOn:'2026-01-01',endsOn:'2026-12-31'}};
 assert.equal(policy.compensationAppliesOn(plan,s.date),s.expected);
});

test('42h editor offers 8h with 2h missing or 8h24 and preserves the contractual target',()=>{
 const render=editorLoader();let value={...policy.distributeWeekly(151200,[1,2,3,4,5]),flexibleWorkDays:5};
 const props=()=>({value,onChange:v=>value=v,ceiling:42,entry:'07:30:00',pause:'01:00:00'});
 let tree=render(props());let choices=nodes(tree).filter(n=>n.type==='input'&&n.props.type==='radio');
 assert.equal(choices.length,2);choices[0].props.onChange();
 assert.equal(value.fiveDay42HourMode,'eightHours');assert.equal(value.contractedSeconds,151200);
 assert.ok(JSON.stringify(render(props())).includes('2h semanais faltantes'));
 tree=render(props());nodes(tree).filter(n=>n.type==='input'&&n.props.type==='radio')[1].props.onChange();
 assert.equal(value.fiveDay42HourMode,'completeWeek');assert.equal(value.contractedSeconds,151200);
 assert.deepEqual(plain(value.dailySeconds),[0,30240,30240,30240,30240,30240,0]);
 value={contractedSeconds:151200,dailySeconds:[0,28800,28800,28800,28800,28800,0]};
 tree=render(props());nodes(tree).filter(n=>n.type==='input'&&n.props.type==='radio')[1].props.onChange();
 assert.deepEqual(plain(value.dailySeconds),[0,30240,30240,30240,30240,30240,0]);
});

test('explicit 42h mode round trips and other contracts keep compensation rules',()=>{
 const {selectedNormalDailySeconds}=load('lib/policies/fiveDay42Hours.ts');
 const doc=documentSchema.parse(structuredClone(sampleDocument)),before=plain(doc.assignments);
 for(const mode of ['eightHours','completeWeek']){
  const plan={...policy.distributeWeekly(151200,[1,2,3,4,5]),fiveDay42HourMode:mode};
  doc.company.defaultWorkload.weeklyPlan=plan;
  const restored=parseNativeText(serializeNative(doc));
  assert.equal(restored.company.defaultWorkload.weeklyPlan.fiveDay42HourMode,mode);
  assert.deepEqual(plain(restored.assignments),before);
  assert.equal(selectedNormalDailySeconds(plan),mode==='eightHours'?28800:30240);
  assert.equal(policy.weeklyPlanIssues(plan,42).includes('compensationRequired'),false);
  assert.equal(selectedNormalDailySeconds({...plan,contractedSeconds:158400}),undefined);
  assert.equal(selectedNormalDailySeconds({...plan,flexibleWorkDays:6}),undefined);
 }
 doc.company.defaultWorkload.weeklyPlan.fiveDay42HourMode='invalid';
 assert.equal(documentSchema.safeParse(doc).success,false);
});
