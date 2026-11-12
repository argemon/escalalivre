const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const load=require('./source-loader.cjs')(),{analyzeDocument}=load('lib/analysis.ts'),{coverageAccumulations}=load('lib/coverageAccumulations.ts');
const plain=v=>JSON.parse(JSON.stringify(v));
function pharmacy(attendants=1){
 const d=structuredClone(require('../../shared/exclusive-coverage-scenarios.json').scenarios.find(s=>s.id==='exclusive-explicit-accumulation').request.document);
 d.roles=d.roles.slice(0,2);d.roles[0].name='Farmacêutico';d.roles[1].name='Atendente';d.roles[0].coverageRoleIds=[d.roles[1].id];
 d.employees[0].name='Ana';d.employees[0].role='Farmacêutico';d.assignments[0].role='Farmacêutico';
 d.company.coverage=d.company.coverage.slice(0,2).map((r,i)=>({...r,role:d.roles[i].name,minimumEmployees:i?attendants:1}));
 d.company.coverage.push({scope:'team',role:'Equipe inteira',day:3,start:'07:30:00',end:'11:30:00',minimumEmployees:1});
 return d;
}
test('pharmacist contributes to both role minima but is one person in the team',()=>{
 const d=pharmacy(),before=JSON.stringify(d),analysis=analyzeDocument(d),notices=coverageAccumulations(d,analysis.coverage);
 assert.equal(analysis.coverageScore,1);assert.ok(analysis.coverage.every(b=>b.assigned===1));
 assert.deepEqual(plain(notices),[{employeeId:d.employees[0].id,employeeName:'Ana',start:'2026-11-04T07:30:00',end:'2026-11-04T11:30:00',roles:['Atendente','Farmacêutico']}]);
 assert.equal(JSON.stringify(d),before);
});
test('minimum of two attendants still requires a second person',()=>{
 const d=pharmacy(2),analysis=analyzeDocument(d);
 assert.ok(analysis.gaps.some(g=>g.role==='Atendente'&&g.missingEmployees===1));
 assert.equal(coverageAccumulations(d,analysis.coverage).length,1);
 const e={...structuredClone(d.employees[0]),id:crypto.randomUUID(),name:'Bruno',role:'Atendente',roleId:d.roles[1].id,accumulationRoleIds:undefined};
 d.employees.push(e);d.assignments.push({...structuredClone(d.assignments[0]),id:crypto.randomUUID(),employeeId:e.id,role:e.role,roleId:e.roleId});
 const filled=analyzeDocument(d);assert.equal(filled.coverageScore,1);
 assert.ok(filled.coverage.filter(b=>b.role==='Atendente').every(b=>b.assigned===2));
 assert.ok(filled.coverage.filter(b=>b.role==='Equipe inteira').every(b=>b.assigned===2));
 assert.ok(coverageAccumulations(d,filled.coverage).every(n=>n.employeeName==='Ana'));
});
test('permission to substitute alone does not imply simultaneous accumulation',()=>{
 const d=pharmacy();delete d.employees[0].accumulationRoleIds;
 const a=analyzeDocument(d);assert.ok(a.coverageScore<1);assert.deepEqual(plain(coverageAccumulations(d,a.coverage)),[]);
});
test('revoking authorization removes the contribution and the notice',()=>{
 const d=pharmacy();d.roles[0].coverageRoleIds=[];
 const a=analyzeDocument(d);assert.ok(a.gaps.some(g=>g.role==='Atendente'));assert.deepEqual(plain(coverageAccumulations(d,a.coverage)),[]);
});
test('breaks split notices and contribute to neither role nor team',()=>{
 const d=pharmacy();d.assignments[0].break={start:'2026-11-04T08:30:00',end:'2026-11-04T09:30:00'};
 const a=analyzeDocument(d),n=coverageAccumulations(d,a.coverage);
 assert.deepEqual(plain(n.map(n=>[n.start,n.end])),[['2026-11-04T07:30:00','2026-11-04T08:30:00'],['2026-11-04T09:30:00','2026-11-04T11:30:00']]);
 assert.ok(a.coverage.filter(b=>b.start>='2026-11-04T08:30:00'&&b.end<='2026-11-04T09:30:00').every(b=>b.assigned===0));
});
test('team presence and distinct role time windows do not produce false accumulation',()=>{
 const d=pharmacy();d.company.coverage[0].end='09:30:00';d.company.coverage[1].start='09:30:00';
 assert.deepEqual(plain(coverageAccumulations(d,analyzeDocument(d).coverage)),[]);
});
test('legacy trace shows actual names while preserving the legacy result shape',()=>{
 const d=pharmacy();delete d.company.coverageMode;delete d.employees[0].accumulationRoleIds;
 const a=analyzeDocument(d),before=JSON.stringify(a);assert.ok(a.coverage.every(b=>b.employeeIds===undefined));
 assert.equal(coverageAccumulations(d,a.coverage)[0].employeeName,'Ana');assert.equal(JSON.stringify(a),before);
});

function mount(file,doc,props={}){
 const states=[];let cursor=0,saved;
 const store={document:doc,analysis:analyzeDocument(doc),selectedEmployeeId:doc.employees[0].id,setDocument:d=>saved=d,upsertEmployee:e=>saved=e,applyTeamPreview:()=>{},setSelectedEmployeeId:()=>{},deleteEmployee:()=>{}};
 const react={...require('react'),useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],value=>states[i]=typeof value==='function'?value(states[i]):value];},useRef:v=>({current:v}),useEffect:()=>{}};
 const exports={},code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/components',file+'.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(code,{exports,crypto,structuredClone,require:r=>r==='react'?react:r==='../store/scheduleStore'?{useScheduleStore:()=>store}:r==='../lib/useDialogFocus'?{useDialogFocus:()=>{}}:r==='../lib/useEditorDismiss'?{useEditorDismiss:()=>({requestClose:()=>{},backdrop:{}})}:r.startsWith('../lib/')?load(r.replace('../','')+'.ts'):r.startsWith('./')?{Button:'button',[r.slice(2)]:r.slice(2)}:require(r)});
 return {render(){cursor=0;const tree=exports[file](props);return typeof tree?.type==='function'?tree.type(tree.props):tree;},saved:()=>saved};
}
const nodes=n=>Array.isArray(n)?n.flatMap(nodes):n&&typeof n==='object'&&n.props?[n,...nodes(n.props.children)]:[];
const text=n=>Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.props?.children):typeof n==='boolean'?'':n??'';
test('allocation panel warns outside its collapsed details and names the simultaneous roles',()=>{
 const ui=mount('CoverageAllocationPanel',pharmacy()),tree=ui.render();
 assert.equal(tree.props.children[0].props.role,'status');assert.match(text(tree),/Ana conta ao mesmo tempo como Atendente e Farmacêutico/);
});
test('coverage form saves the minimum per role and preserves shifts',()=>{
 const d=pharmacy(),ui=mount('CompanyEditor',d,{tab:'coverage',onClose:()=>{}}),before=plain(d.assignments);
 const field=nodes(ui.render()).filter(n=>n.props.label==='Mínimo de pessoas nesta função')[1];
 nodes(field).find(n=>n.type==='input').props.onChange({target:{valueAsNumber:2}});
 nodes(ui.render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
 assert.ok(ui.saved(),'form saved');assert.ok(ui.saved().company.coverage.some(r=>r.role==='Atendente'&&r.minimumEmployees===2));assert.deepEqual(plain(ui.saved().assignments),before);
});
test('employee form requires both functions when simultaneous coverage is activated',()=>{
 const d=pharmacy();delete d.employees[0].accumulationRoleIds;const ui=mount('EmployeeDrawer',d);
 const option=nodes(ui.render()).find(n=>n.type==='label'&&text(n).includes('Pode cobrir duas ou mais funções ao mesmo tempo'));
 nodes(option).find(n=>n.type==='input').props.onChange({target:{checked:true}});
 nodes(ui.render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
 assert.equal(ui.saved(),undefined);assert.match(text(ui.render()),/Selecione pelo menos duas funções/);
 const group=nodes(ui.render()).find(n=>n.type==='fieldset'&&nodes(n).some(c=>c.type==='legend'&&text(c)==='Funções que pode ocupar ao mesmo tempo'));
 const attendant=nodes(group).find(n=>n.type==='label'&&text(n).trim()==='Atendente');nodes(attendant).find(n=>n.type==='input').props.onChange({target:{checked:true}});
 nodes(ui.render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
 assert.deepEqual(plain(ui.saved().accumulationRoleIds),d.roles.map(r=>r.id));
});
