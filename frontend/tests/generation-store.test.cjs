const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function setup(){
 let complete,applied=0,calls=0;const original={id:'original'};
 const schedule={document:original,setSolverStatus(s){schedule.solverStatus=s;},applyGeneratedSchedule(){applied++;}};
 const exports={};
 const source=fs.readFileSync(path.join(__dirname,'../src/store/generationStore.ts'),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,Date,require:r=>r==='zustand'?require(r):r==='./scheduleStore'?{useScheduleStore:{getState:()=>schedule}}:{
  solveQueued:async(_document,progress)=>{calls++;progress({id:'token',state:'queued'});return new Promise(resolve=>{complete=resolve;});},
  cancelQueuedSolve:async()=>{}
 }});
 return {store:exports.useGenerationStore,schedule,complete:r=>complete(r),applied:()=>applied,calls:()=>calls};
}
test('a shared active generation prevents duplicate submissions across remounted panels',async()=>{
 const s=setup();const pending=s.store.getState().start();await s.store.getState().start();
 assert.equal(s.calls(),1);assert.equal(s.store.getState().active,true);
 s.complete({assignments:[]});await pending;assert.equal(s.applied(),1);assert.equal(s.store.getState().active,false);
});
test('edits made while waiting are never overwritten by an older result',async()=>{
 const s=setup();const pending=s.store.getState().start();s.schedule.document={id:'changed'};
 s.complete({assignments:[]});await pending;
 assert.equal(s.applied(),0);assert.match(s.store.getState().message,/planejamento mudou/);
});
test('cancelled generation keeps existing shifts and resets the generation status',async()=>{
 const s=setup();const pending=s.store.getState().start();await s.store.getState().cancel();s.complete(null);await pending;
 assert.equal(s.applied(),0);assert.equal(s.schedule.solverStatus,'idle');assert.match(s.store.getState().message,/cancelada/);
});
