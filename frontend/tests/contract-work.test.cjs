const {test}=require('node:test'),assert=require('node:assert/strict');
const load=require('./source-loader.cjs')();
const {analyzeDocument}=load('lib/analysis.ts');
test('saving a manual early exit immediately reports one hour missing and preserves other shift data',()=>{
 const fixture=require('../../shared/contract-work-scenarios.json').scenarios.find(s=>s.id==='forty-not-ceiling');
 const {useScheduleStore:store}=load('store/scheduleStore.ts');
 const {documentSchema}=load('lib/documentSchema.ts');
 const {serializeNative,parseNativeText}=load('lib/nativeDocument.ts');
 store.getState().setDocument(documentSchema.parse(structuredClone(fixture.request.document)));
 const before=JSON.parse(JSON.stringify(store.getState().document));
 const shift=before.assignments[0],updated={...shift,end:'2026-11-09T15:30:00'};
 store.getState().upsertAssignment(updated);
 const state=store.getState(),summary=state.analysis.workloads[0];
 assert.equal(summary.unmetSeconds,3600);assert.equal(summary.days[0].unmetSeconds,3600);
 assert.equal(summary.expectedSeconds,144000);
 assert.deepEqual(JSON.parse(JSON.stringify(state.document.assignments.find(a=>a.id===shift.id))),updated);
 assert.deepEqual(JSON.parse(JSON.stringify(state.document.assignments.filter(a=>a.id!==shift.id))),before.assignments.slice(1));
 const saved=parseNativeText(serializeNative(state.document));
 assert.equal(analyzeDocument(saved).workloads[0].unmetSeconds,3600);
});
test('manual exit editor saves the selected time and refuses to cut through the saved pause',()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
 const {useScheduleStore:store}=load('store/scheduleStore.ts');
 const {documentSchema}=load('lib/documentSchema.ts');
 const fixture=require('../../shared/contract-work-scenarios.json').scenarios.find(s=>s.id==='forty-not-ceiling');
 store.getState().setDocument(documentSchema.parse(structuredClone(fixture.request.document)));
 const states=[];let cursor=0;
 const react={useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],v=>states[i]=v];}};
 const exports={};
 const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/components/EmployeeShiftEditor.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(code,{exports,require:r=>r==='react'?react:r==='./ui'?{Button:'button'}:r==='../store/scheduleStore'?{useScheduleStore:()=>store.getState()}:r.startsWith('../lib/')?load(r.replace('../','')+'.ts'):require(r)});
 const shift=store.getState().document.assignments[0];
 const render=()=>{cursor=0;return exports.EmployeeShiftEditor({shift});};
 const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)];
 let tree=render();nodes(tree).find(n=>n.type==='input').props.onChange({target:{value:'2026-11-09T12:30'}});
 tree=render();nodes(tree).find(n=>n.type==='button').props.onClick();
 assert.equal(store.getState().document.assignments[0].end,shift.end);
 assert.ok(nodes(render()).some(n=>n.props?.role==='alert'));
 tree=render();nodes(tree).find(n=>n.type==='input').props.onChange({target:{value:'2026-11-09T15:30'}});
 tree=render();nodes(tree).find(n=>n.type==='button').props.onClick();
 assert.equal(store.getState().document.assignments.find(a=>a.id===shift.id).end,'2026-11-09T15:30:00');
 assert.equal(store.getState().analysis.workloads[0].unmetSeconds,3600);
});
for(const s of require('../../shared/contract-work-scenarios.json').scenarios)test('contract work: '+s.id,()=>{
 const before=JSON.stringify(s.request.document),result=analyzeDocument(s.request.document),w=result.workloads[0],e=s.expected;
 assert.equal(w.expectedSeconds,e.expected);assert.equal(w.plannedSeconds,e.planned);assert.equal(w.unmetSeconds,e.unmet);assert.equal(w.excusedSeconds,e.excused);assert.equal(w.historicalWorkSeconds,e.history??0);
 assert.deepEqual([...new Set(result.conflicts.filter(c=>c.severity==='error').map(c=>c.code))].sort(),e.errors.slice().sort());
 assert.equal(result.conflicts.some(c=>c.code==='workloadShortfall'),e.unmet>0);
 if(e.transitionCodes)assert.deepEqual([...new Set(result.conflicts.filter(c=>c.code.endsWith('Transition')).map(c=>c.code))].sort(),e.transitionCodes);
 assert.equal(JSON.stringify(s.request.document),before);
});

test('explicit contractual leave survives native save without changing shifts and rejects invalid credits',()=>{
 const {sampleDocument}=load('data/sample.ts'),{documentSchema}=load('lib/documentSchema.ts'),{serializeNative,parseNativeText}=load('lib/nativeDocument.ts');
 const doc=documentSchema.parse(structuredClone(sampleDocument)),before=JSON.stringify(doc.assignments);
 doc.employees[0].contractLeaves=[{date:'2026-11-09',excusedSeconds:3601}];
 const saved=parseNativeText(serializeNative(doc));assert.equal(saved.employees[0].contractLeaves[0].excusedSeconds,3601);assert.equal(JSON.stringify(saved.assignments),before);
 saved.employees[0].contractLeaves=null;assert.equal(documentSchema.safeParse(saved).success,true);
 for(const seconds of [-1,0,86401,0.5]){saved.employees[0].contractLeaves=[{date:'2026-11-09',excusedSeconds:seconds}];assert.equal(documentSchema.safeParse(saved).success,false);}
});
