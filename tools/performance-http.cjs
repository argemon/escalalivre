// Real API and child workers, with production protection defaults. No bearer tokens are persisted.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{once}=require('node:events'),{performance}=require('node:perf_hooks');
const {env}=require('./performance-benchmark.cjs');
const {digest}=require('../shared/parity-contract.cjs');const load=require('../frontend/tests/source-loader.cjs')();const {analyzeDocument}=load('lib/analysis.ts');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function run(snapshot,repetition){
 const portServer=net.createServer();await new Promise(r=>portServer.listen(0,'127.0.0.1',r));const port=portServer.address().port;await new Promise(r=>portServer.close(r));
 const directory=path.join(snapshot,'backend/EscalaLivre.Api'),url='http://127.0.0.1:'+port,started=performance.now();
 const server=spawn('dotnet',[path.join(directory,'bin/Release/net10.0/EscalaLivre.Api.dll')],{cwd:directory,env:{...env,ASPNETCORE_ENVIRONMENT:'Production',ASPNETCORE_URLS:url},windowsHide:true});let logs='';server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
 let monitor,memory='';const rows=[];
 const request=JSON.parse(fs.readFileSync(path.join(snapshot,'inputs/fortnight-history.json'),'utf8'));
 const post=(route,body)=>fetch(url+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});
 const check=result=>{if(['optimal','feasible','not-run'].includes(result.optimization?.status))assert.deepEqual(digest(result),digest(analyzeDocument({...request.document,assignments:result.assignments})));};
 try {
  let ready=false;for(let i=0;i<200;i++){if(server.exitCode!==null)throw Error('API exited: '+logs);try{if((await fetch(url+'/health')).ok){ready=true;break;}}catch{}await sleep(50);}assert.ok(ready,'API startup');const startupMs=performance.now()-started;
  monitor=spawn('dotnet',[path.join(snapshot,'Bench/bin/Release/net10.0/Bench.dll'),'--monitor',String(server.pid)],{env,windowsHide:true});monitor.stdout.on('data',b=>memory+=b);
  for(const route of ['/analyze','/solve']){const response=await post(route,request);assert.equal(response.status,200,'warm '+route);check((await response.json()).data);}
  for(const route of ['/analyze','/solve']){const t=performance.now(),response=await post(route,request);assert.equal(response.status,200,route);const result=(await response.json()).data;check(result);rows.push({route,elapsedMs:performance.now()-t,status:result.optimization?.status,score:result.coverageScore,assignmentCount:result.assignments.length});}
  const began=performance.now();const jobs=await Promise.all(Array.from({length:3},async()=>{const submitted=performance.now(),response=await post('/solve/jobs',request);assert.equal(response.status,202);const {data}=await response.json();return {id:data.id,submitted,admissionMs:performance.now()-submitted,initialState:data.state,sawQueued:data.state==='queued',sawProcessing:data.state==='processing'};}));
  await Promise.all(jobs.map(async job=>{const deadline=performance.now()+45000;while(performance.now()<deadline){const response=await fetch(url+'/solve/jobs/'+job.id);assert.equal(response.status,200);const {data}=await response.json();job.sawQueued ||= data.state==='queued';job.sawProcessing ||= data.state==='processing';if(['completed','failed','cancelled'].includes(data.state)){assert.equal(data.state,'completed');check(data.result);job.elapsedMs=performance.now()-job.submitted;job.status=data.result.optimization?.status;job.score=data.result.coverageScore;delete job.id;delete job.submitted;return;}await sleep(100);}throw Error('Queue did not drain');}));
  rows.push({route:'/solve/jobs',burstSize:3,totalDrainMs:performance.now()-began,jobs});
  // Independent transport limit: a 20,000-shift file exceeds the existing 2 MiB HTTP body cap.
  const large=JSON.parse(fs.readFileSync(path.join(snapshot,'inputs/history-limit.json'),'utf8')),t=performance.now(),largeResponse=await post('/analyze',large);assert.equal(largeResponse.status,413);await largeResponse.text();rows.push({route:'/analyze',scenario:'history-limit-body-rejected',httpStatus:413,elapsedMs:performance.now()-t});
  monitor.stdin.end('stop\n');await once(monitor,'exit');const parentMemory=JSON.parse(memory.trim());assert.ok(parentMemory.samples>0&&parentMemory.sampledPeakWorkingSetBytes>0,"Parent memory sampler must run");
  const events=(prefix)=>[...logs.matchAll(new RegExp(prefix+' (\\{[^\\r\\n]*\\})','g'))].map(m=>JSON.parse(m[1]));
  const workers=events('BENCHWORKER'),queue=events('BENCHQUEUE');assert.equal(workers.length,7);assert.equal(queue.length,3);assert.ok(workers.every(w=>w.sampledPeakWorkingSetBytes>0));
  return {repetition,startupMs,rows,parentMemory,workers,queue,limits:{concurrentWorkers:1,jobQueueLimit:20,workerTimeoutSeconds:12,workerMemoryMb:512,solvesPerMinute:6,requestBytes:2097152}};
 }finally{
  if(monitor&&monitor.exitCode===null){monitor.stdin.end('stop\n');await once(monitor,'exit');}
  server.kill();if(server.exitCode===null)await once(server,'exit');
 }
}
async function main(){const snapshot=path.resolve(process.argv[2]),reps=Number(process.argv[3]??3);assert.ok(Number.isInteger(reps)&&reps>=1&&reps<=5);const samples=[];for(let i=0;i<reps;i++){samples.push(await run(snapshot,i));fs.writeFileSync(path.join(snapshot,'http-samples.json'),JSON.stringify(samples,null,2));console.log(JSON.stringify(samples.at(-1)));}}
main().catch(e=>{console.error(e);process.exitCode=1;});
