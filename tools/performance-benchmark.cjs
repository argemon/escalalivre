// Isolated copies of CURRENT working sources. Never patches the live checkout or reuses its DLLs.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawnSync,spawn}=require('node:child_process');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
function write(file,body){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,body);}
function command(exe,args,options={}){const r=spawnSync(exe,args,{encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:32*1024*1024,...options});if(r.error||r.status!==0)throw Error(exe+' '+args.join(' ')+' '+(r.error??'')+'\n'+r.stdout+'\n'+r.stderr);return r.stdout;}
const env={...process.env,DOTNET_PROCESSOR_COUNT:'1',OMP_NUM_THREADS:'1',DOTNET_TieredCompilation:'0',TZ:'America/Cuiaba'};
function snapshot(repo,out){
 if(fs.existsSync(out))throw Error('Use a new output directory; snapshots are never overwritten');fs.mkdirSync(out,{recursive:true});const manifest=[];
 for(const dir of ['backend/EscalaLivre.Domain','backend/EscalaLivre.Application','backend/EscalaLivre.Infrastructure','backend/EscalaLivre.Api','shared'])for(const relative of fs.readdirSync(path.join(repo,dir),{recursive:true}).filter(f=>!f.split(/[\\/]/).some(p=>['bin','obj'].includes(p)))){
  const source=path.join(repo,dir,relative);if(!fs.statSync(source).isFile())continue;const rel=dir+'/'+relative.replaceAll('\\','/'),bytes=fs.readFileSync(source);write(path.join(out,rel),bytes);manifest.push({file:rel,sha256:sha(bytes)});
 }
 write(path.join(out,'global.json'),fs.readFileSync(path.join(repo,'global.json')));
 const fixtures=require(path.join(repo,'shared/performance-scenarios.cjs')).scenarios();
 for(const f of fixtures)write(path.join(out,'inputs',f.id+'.json'),JSON.stringify(f.request));
 write(path.join(out,'cases.json'),JSON.stringify(fixtures.map(({request,...meta})=>({...meta,requestBytes:Buffer.byteLength(JSON.stringify(request)),inputSha256:sha(JSON.stringify(request))})),null,2));
 const meta={generatedAt:new Date().toISOString(),node:process.version,platform:os.platform(),os:os.release(),cpu:os.cpus()[0].model,logicalProcessors:os.cpus().length,totalMemoryBytes:os.totalmem(),dotnet:command('dotnet',['--info'],{cwd:repo}),controlledEnvironment:Object.fromEntries(Object.entries(env).filter(([k])=>['DOTNET_PROCESSOR_COUNT','OMP_NUM_THREADS','DOTNET_TieredCompilation','TZ'].includes(k))),warmupsPerProcess:1,measurementsPerProcess:1,manifest};
 write(path.join(out,'snapshot.json'),JSON.stringify(meta,null,2));
 const replace=(file,old,next)=>{const p=path.join(out,file),s=fs.readFileSync(p,'utf8');if(!s.includes(old))throw Error('Instrumentation marker missing: '+file+' '+old);write(p,s.replace(old,next));};
 for(const [file,source] of [['backend/EscalaLivre.Domain/Scheduling/PerformancePhaseProbe.cs','PhaseProbe.cs'],['backend/EscalaLivre.Infrastructure/Solver/PerformanceModelProbe.cs','ModelProbe.cs'],['Bench/Program.cs','Program.cs']])write(path.join(out,file),fs.readFileSync(path.join(__dirname,'performance',source)));
 write(path.join(out,'Bench/Bench.csproj'),'<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable></PropertyGroup><ItemGroup><ProjectReference Include="../backend/EscalaLivre.Api/EscalaLivre.Api.csproj" /></ItemGroup></Project>');
 replace('backend/EscalaLivre.Domain/Scheduling/ScheduleEvaluator.cs','var conflicts = ScheduleRules.Diagnose(document, assignments).ToList();','List<ScheduleIssue> conflicts; using(PerformancePhaseProbe.Measure("diagnostics")) conflicts=ScheduleRules.Diagnose(document,assignments).ToList();');
 replace('backend/EscalaLivre.Domain/Scheduling/ScheduleEvaluator.cs','var coverage = ScheduleCoverage.Evaluate(document, start, end, assignments);','CoverageAssessment coverage; using(PerformancePhaseProbe.Measure("coverage")) coverage=ScheduleCoverage.Evaluate(document,start,end,assignments);');
 write(path.join(out,'backend/EscalaLivre.Infrastructure/Solver/OrToolsScheduleOptimizer.cs'),`using EscalaLivre.Application.Contracts;using EscalaLivre.Application.Scheduling;using EscalaLivre.Domain.Scheduling;
namespace EscalaLivre.Infrastructure.Solver;
public sealed class OrToolsScheduleOptimizer(ScheduleCandidateGenerator generator,ScheduleModelBuilder builder,OrToolsExecution execution,ScheduleResultReader reader):IScheduleOptimizer {
 public ScheduleOptimizationResult Optimize(ScheduleRequest request){var budget=new OptimizationBudget();ScheduleModelInput input;using(PerformancePhaseProbe.Measure("candidates"))input=new(request,generator.Generate(request),budget);ScheduleModelContext context;using(PerformancePhaseProbe.Measure("model"))context=builder.Build(input,budget);using(PerformancePhaseProbe.Measure("modelMetrics"))PerformanceModelProbe.Capture(context,budget);OrToolsRun run;using(PerformancePhaseProbe.Measure("solver"))run=execution.Solve(context.Model);PerformanceModelProbe.Capture(run.Solver);using(PerformancePhaseProbe.Measure("read"))return reader.Read(context,run);}
}`);
 replace('backend/EscalaLivre.Infrastructure/Solver/ScheduleModelBuilder.cs','foreach (var translator in constraints) translator.Apply(context, budget);','foreach(var translator in constraints) { using var phase=PerformancePhaseProbe.Measure(translator.GetType().Name);try{translator.Apply(context,budget);}catch{PerformanceModelProbe.Capture(context,budget);throw;} }');
 replace('backend/EscalaLivre.Infrastructure/Solver/ScheduleModelBuilder.cs','objective.Apply(context);','using(PerformancePhaseProbe.Measure("objective"))objective.Apply(context);');
 replace('backend/EscalaLivre.Infrastructure/Solver/OptimizationBudget.cs','public void CheckCandidates(int count) {','public void CheckCandidates(int count) { PerformanceModelProbe.Candidates=count;');
 replace('backend/EscalaLivre.Api/CalculationWorker.cs','var stopwatch = Stopwatch.StartNew();','var stopwatch = Stopwatch.StartNew(); long benchmarkPeak=0;');
 replace('backend/EscalaLivre.Api/CalculationWorker.cs','if (memory is null) break;','if (memory is null) break; benchmarkPeak=Math.Max(benchmarkPeak,memory.Value);');
 replace('backend/EscalaLivre.Api/CalculationWorker.cs','logger.LogInformation("Calculation {Operation} completed in {DurationMs}ms", operation, stopwatch.ElapsedMilliseconds);','logger.LogInformation("BENCHWORKER {Data}",JsonSerializer.Serialize(new{operation,elapsedMs=stopwatch.Elapsed.TotalMilliseconds,sampledPeakWorkingSetBytes=benchmarkPeak}));');
 replace('backend/EscalaLivre.Api/ScheduleJobQueue.cs','finally { lock (gate) job.Finished = DateTimeOffset.UtcNow; }','finally { lock (gate) job.Finished=DateTimeOffset.UtcNow; logger.LogInformation("BENCHQUEUE {Data}",JsonSerializer.Serialize(new{queueMs=(job.Started!.Value-job.Created).TotalMilliseconds,processingMs=(job.Finished!.Value-job.Started.Value).TotalMilliseconds,state=job.State})); }');
 console.log(JSON.stringify({snapshot:out,cases:fixtures.length,files:manifest.length}));
}
function build(out){write(path.join(out,'build.txt'),command('dotnet',['build','Bench/Bench.csproj','-c','Release','-t:Rebuild'],{cwd:out}));console.log('BUILT '+out);}
function sample(out,id,operation){const input=path.join(out,'inputs',id+'.json');return JSON.parse(command('dotnet',[path.join(out,'Bench/bin/Release/net10.0/Bench.dll'),input,operation],{cwd:out,env,timeout:90000}).trim().split(/\r?\n/).at(-1));}
function measure(out,repetitions=5,selected){
 if(!Number.isInteger(repetitions)||repetitions<1||repetitions>9)throw Error('Repetitions 1..9');
 const cases=JSON.parse(fs.readFileSync(path.join(out,'cases.json'))).filter(c=>!selected||c.id===selected),rows=[];
 for(const c of cases)for(const operation of c.operations)for(let repetition=0;repetition<repetitions;repetition++){
  const row={scenario:c.id,operation,repetition,...sample(out,c.id,operation)};assert.ok(row.correct&&row.inputUnchanged);if(c.expectedComplexity&&operation==='solve')assert.equal(row.outcome,'complexityLimit');rows.push(row);write(path.join(out,selected?'pilot-'+selected+'.json':'samples.json'),JSON.stringify(rows,null,2));console.log(JSON.stringify(row));
 }return rows;
}
function compare(base,after,out){
 const ma=JSON.parse(fs.readFileSync(path.join(base,'snapshot.json'))),mb=JSON.parse(fs.readFileSync(path.join(after,'snapshot.json')));for(const k of ['node','platform','os','cpu','controlledEnvironment'])assert.deepEqual(ma[k],mb[k],'Environment differs '+k);
 const cases=JSON.parse(fs.readFileSync(path.join(base,'cases.json')));assert.deepEqual(cases,JSON.parse(fs.readFileSync(path.join(after,'cases.json'))));
 const a=JSON.parse(fs.readFileSync(path.join(base,'samples.json'))),b=JSON.parse(fs.readFileSync(path.join(after,'samples.json')));
 const stats=values=>{values.sort((x,y)=>x-y);const mid=values[Math.floor(values.length/2)];return {n:values.length,min:values[0],median:mid,max:values.at(-1),mad:values.map(v=>Math.abs(v-mid)).sort((x,y)=>x-y)[Math.floor(values.length/2)]};};
 const summary=[];for(const c of cases)for(const operation of c.operations){const first=a.filter(r=>r.scenario===c.id&&r.operation===operation),second=b.filter(r=>r.scenario===c.id&&r.operation===operation);assert.equal(first.length,second.length);if(operation==='analyze')assert.equal(new Set([...first,...second].map(r=>r.analysisSha256)).size,1,'Analysis differs '+c.id);
  const metrics={};const get=(r,key)=>key==='elapsedMs'?r.elapsedMs:key.startsWith('memory.')?r.memory[key.slice(7)]:key.startsWith('model.')?r.model[key.slice(6)]:r.phases.filter(p=>p.phase===key).reduce((n,p)=>n+p.milliseconds,0);
  for(const key of ['elapsedMs','diagnostics','coverage','candidates','model','solver','memory.allocatedManagedBytes','memory.peakWorkingSetBytes','model.candidates','model.variables','model.constraints','model.serializedBytes','model.steps']){const baseline=stats(first.map(r=>get(r,key))),final=stats(second.map(r=>get(r,key)));metrics[key]={baseline,final,deltaPercent:baseline.median?(final.median/baseline.median-1)*100:null,alertThreshold:baseline.max,exceedsBaselineEnvelope:final.median>baseline.max};}
  for(const field of ['candidates','variables','constraints','serializedBytes','steps'])assert.equal(new Set([...first,...second].map(r=>r.model[field])).size,1,'Model shape differs '+c.id+' '+field);
  const optimal=[...first,...second].filter(r=>r.status==='optimal');if(optimal.length>1)assert.equal(new Set(optimal.map(r=>r.solver.objective)).size,1,'Optimal objective differs '+c.id);
  summary.push({scenario:c.id,operation,metrics,baselineOutcomes:first.map(r=>[r.outcome,r.status,r.score]),finalOutcomes:second.map(r=>[r.outcome,r.status,r.score])});
 }write(path.join(out,'comparison.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary.map(r=>({scenario:r.scenario,operation:r.operation,beforeMs:r.metrics.elapsedMs.baseline.median,afterMs:r.metrics.elapsedMs.final.median})),null,2));
}
async function main(){const [mode,...a]=process.argv.slice(2);if(mode==='snapshot')snapshot(path.resolve(a[0]),path.resolve(a[1]));else if(mode==='build')build(path.resolve(a[0]));else if(mode==='measure')measure(path.resolve(a[0]),a[1]?Number(a[1]):5,a[2]);else if(mode==='compare')compare(...a.map(p=>path.resolve(p)));else throw Error('Modes: snapshot REPO NEW_DIR | build DIR | measure DIR [1..9 repetitions] [case] | compare BASE AFTER OUTPUT');}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={snapshot,build,measure,sample,compare,env};
