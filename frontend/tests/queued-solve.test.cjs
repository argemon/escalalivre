const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function service(fetch){
 const exports={};
 const source=fs.readFileSync(path.join(__dirname,'../src/lib/queuedSolve.ts'),'utf8').replaceAll('import.meta.env','testEnv');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,testEnv:{DEV:false},fetch,AbortSignal,TextEncoder,setTimeout:fn=>{fn();return 1;},
 require:name=>name==='./analysis'?{planningPeriod:()=>({start:'',end:''})}:{normalizeDocumentTimes:d=>d,normalizeResultTimes:r=>r}});
 return exports;
}
const reply=data=>Response.json({success:true,data});
const job={id:'secret-token',state:'queued',position:2,jobsAhead:2,estimatedWaitSeconds:16,pollAfterSeconds:3};
test('accepted job is polled through queue and processing to the result',async()=>{
 const paths=[],states=[],responses=[job,{...job,state:'processing'},{...job,state:'completed',result:{assignments:[]}}];
 const api=service(async(p,o)=>{paths.push([p,o.method]);return reply(responses.shift());});
 const result=await api.solveQueued({company:{timeZone:'America/Cuiaba'}},p=>states.push(p.state));
 assert.deepEqual(paths,[['/solve/jobs','POST'],['/solve/jobs/secret-token',undefined],['/solve/jobs/secret-token',undefined]]);
 assert.deepEqual(states,['queued','processing','completed']);assert.equal(result.assignments.length,0);
});
test('temporary polling disconnection preserves token and never resubmits',async()=>{
 let calls=0,posts=0;const states=[];
 const api=service(async(p,o)=>{
   calls++;if(o.method==='POST'){posts++;return reply(job);}
   if(calls===2)throw new TypeError('offline');
   if(calls===3)return new Response('busy',{status:429});
   return reply({...job,state:'cancelled'});
 });
 assert.equal(await api.solveQueued({company:{}},p=>states.push(p)),null);
 assert.equal(posts,1);assert.equal(calls,4);assert.equal(states[1].reconnecting,true);
});
test('queue full, expired job and calculation failures explain what happened',async()=>{
 await assert.rejects(service(async()=>Response.json({success:false,errors:[{message:'Fila cheia'}]},{status:503})).solveQueued({},()=>{}),/Fila cheia/);
 let calls=0;
 await assert.rejects(service(async()=>++calls===1?reply(job):Response.json({errors:[{message:'Pedido expirou'}]},{status:404})).solveQueued({},()=>{}),/Pedido expirou/);
 await assert.rejects(service(async()=>reply({...job,state:'failed',error:'Reduza o período'})).solveQueued({},()=>{}),/Reduza o período/);
});
test('cancellation uses DELETE with the private token and request limits apply before submission',async()=>{
 let request;
 const api=service(async(p,o)=>{request=[p,o.method];return reply({...job,state:'cancelled'});});
 await api.cancelQueuedSolve(job.id);assert.deepEqual(request,['/solve/jobs/secret-token','DELETE']);
 let calls=0;
 await assert.rejects(service(async()=>{calls++;}).solveQueued({pad:'é'.repeat(1024*1024)},()=>{}),/2 MB/);
 assert.equal(calls,0);
 assert.equal(api.durationLabel(125),'2 min 5 s');
});
