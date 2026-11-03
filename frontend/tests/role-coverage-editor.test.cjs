const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('typescript');
const sourceLoader=require('./source-loader.cjs');
function editor(document) {
  const load=sourceLoader(),store=load('store/scheduleStore.ts').useScheduleStore;
  store.getState().setDocument(document);
  const state=[];let cursor=0;
  const exports={};
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/components/RolesEditor.tsx'),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}
  }).outputText;
  vm.runInNewContext(code,{exports,crypto,require:r=>{
    if(r==='react')return {useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],v=>{state[i]=v;}];}};
    if(r==='../store/scheduleStore')return {useScheduleStore:()=>store.getState()};
    if(r==='./ui')return load('components/ui.tsx');
    return r.startsWith('.')?load(path.posix.normalize(path.posix.join('components',r))+'.ts'):require(r);
  }});
  return {store,render(){cursor=0;return exports.RolesEditor();}};
}
function nodes(node) {return Array.isArray(node)?node.flatMap(nodes):node&&typeof node==='object'&&node.props?[node,...nodes(node.props.children)]:[];}
function text(node) {return Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.props?.children):node??'';}
function fixture(){return structuredClone(require('../../shared/role-coverage-scenarios.json').scenarios[0].request.document);}
function check(ui,name,checked) {
  const label=nodes(ui.render()).find(n=>n.type==='label'&&text(n)==='Pode cobrir '+name);
  nodes(label).find(n=>n.type==='input').props.onChange({target:{checked}});
}
function submit(ui){nodes(ui.render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});}

test('role form creates one role with multiple grants inherited by a newly registered employee',()=>{
  const ui=editor(fixture());
  nodes(ui.render()).find(n=>n.type==='input'&&n.props.type!=='checkbox').props.onChange({target:{value:'Diretor'}});
  check(ui,'Caixa',true);check(ui,'Vendedor',true);submit(ui);
  const doc=ui.store.getState().document,role=doc.roles.find(r=>r.name==='Diretor');
  assert.deepEqual([...role.coverageRoleIds],[...doc.roles.filter(r=>['Caixa','Vendedor'].includes(r.name)).map(r=>r.id)]);
  const e={...doc.employees[0],id:crypto.randomUUID(),name:'Diretor novo',roleId:role.id,role:role.name,coverageRoleIds:[]};
  ui.store.getState().upsertEmployee(e);
  const {canCover}=sourceLoader()('lib/coverageAllocation.ts');
  for(const requirement of doc.company.coverage.slice(1))assert.ok(canCover(e,requirement,ui.store.getState().document.roles));
  assert.equal(nodes(ui.render()).find(n=>n.type==='input'&&n.props.type!=='checkbox').props.value,'');
});

test('editing role grants changes all employees and keeps every saved shift unchanged',()=>{
  const doc=fixture(),before=structuredClone(doc.assignments),ui=editor(doc);
  const manager=nodes(ui.render()).find(n=>n.type==='article'&&nodes(n).some(c=>c.type==='h4'&&text(c)==='Gerente'));
  nodes(manager).find(n=>text(n)==='Editar'&&n.props.onClick).props.onClick();
  check(ui,'Caixa',false);check(ui,'Vendedor',false);submit(ui);
  assert.deepEqual([...ui.store.getState().document.roles[0].coverageRoleIds],[]);
  assert.equal(ui.store.getState().analysis.coverageScore,0.333);
  assert.deepEqual(JSON.parse(JSON.stringify(ui.store.getState().document.assignments)),before);
  assert.ok(ui.store.getState().document.employees.every(e=>e.coverageRoleIds.length===0));
});

test('incoming role grants prevent deleting their target until the references are removed',()=>{
  const doc=fixture();doc.assignments=[];doc.employees=[];doc.company.coverage=[];
  const ui=editor(doc);
  const cashier=nodes(ui.render()).find(n=>n.type==='article'&&nodes(n).some(c=>c.type==='h4'&&text(c)==='Caixa'));
  assert.equal(nodes(cashier).find(n=>text(n)==='Excluir'&&n.props.onClick).props.disabled,true);
});
