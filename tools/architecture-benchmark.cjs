// Reconstruct and compare isolated production snapshots; never edits the checked-out sources.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process'),crypto=require('node:crypto');
const root=process.argv[2]&&path.resolve(process.argv[2]),output=process.argv[3]&&path.resolve(process.argv[3]),revision=process.argv[4]||'66659daa2bbfc2384605946ec5b553e0bcd51eed';
if(!root||!output)throw Error('Usage: node benchmark.cjs REPO NEW_OUTPUT_DIRECTORY [BASELINE_REF]');
if(fs.existsSync(output))throw Error('Output must be a new directory; no files are deleted or overwritten.');
fs.mkdirSync(output,{recursive:true});
function command(binary,args,options={}){
 const result=spawnSync(binary,args,{cwd:root,windowsHide:true,encoding:'utf8',maxBuffer:32*1024*1024,...options});
 if(result.status!==0)throw Error(binary+' '+args.join(' ')+'\n'+result.stdout+'\n'+result.stderr);
 return result.stdout;
}
function write(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data);}
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const layers=['Domain','Application','Infrastructure','Api'];
const tracked=command('git',['ls-tree','-r','--name-only',revision,'--','backend','global.json']).trim().split(/\r?\n/)
 .filter(file=>file==='global.json'||layers.some(layer=>file.startsWith('backend/EscalaLivre.'+layer+'/')));
for(const file of tracked){
 const result=spawnSync('git',['show',revision+':'+file],{cwd:root,windowsHide:true,maxBuffer:32*1024*1024});
 if(result.status!==0)throw Error('Cannot reconstruct '+file);
 write(path.join(output,'baseline',file),result.stdout);
}
const manifest=[];
for(const layer of layers){
 const folder='backend/EscalaLivre.'+layer;
 for(const relative of fs.readdirSync(path.join(root,folder),{recursive:true}).filter(f=>fs.statSync(path.join(root,folder,f)).isFile()&&!f.split(/[\\/]/).some(p=>p==='bin'||p==='obj'))){
  const file=folder+'/'+relative.replaceAll('\\','/'),bytes=fs.readFileSync(path.join(root,file));write(path.join(output,'final',file),bytes);manifest.push({file,sha256:sha(bytes)});
 }
}
for(const version of ['baseline','final']){
 write(path.join(output,version,'global.json'),fs.readFileSync(path.join(root,'global.json')));
 fs.cpSync(path.join(root,'shared'),path.join(output,version,'shared'),{recursive:true});
 const solver=path.join(output,version,'backend/EscalaLivre.Infrastructure/Solver',version==='baseline'?'OrToolsScheduleSolver.cs':'OrToolsScheduleOptimizer.cs');
 let source=fs.readFileSync(solver,'utf8');
 const marker=version==='baseline'?'CpSolverStatus status = solver.Solve(model);':'return reader.Read(context, execution.Solve(context.Model));';
 if(!source.includes(marker))throw Error('Instrumentation marker missing: '+version);
 source=source.replace(marker,(version==='baseline'?'BenchmarkModelProbe.Capture(model);\n        ':'BenchmarkModelProbe.Capture(context.Model);\n        ')+marker);
 fs.writeFileSync(solver,source);
 write(path.join(output,version,'backend/EscalaLivre.Infrastructure/Solver/BenchmarkModelProbe.cs'),String.raw`using Google.OrTools.Sat;
namespace EscalaLivre.Infrastructure.Solver;
public static class BenchmarkModelProbe
{
    public static int Variables { get; private set; }
    public static int Constraints { get; private set; }
    public static int SerializedBytes { get; private set; }
    public static void Capture(CpModel model)
    {
        Variables = model.Model.Variables.Count;
        Constraints = model.Model.Constraints.Count;
        SerializedBytes = model.Model.CalculateSize();
    }
}
`);
 const bench=path.join(output,version,'Bench');
 write(path.join(bench,'Bench.csproj'),`<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable>${version==='baseline'?'<DefineConstants>LEGACY</DefineConstants>':''}</PropertyGroup><ItemGroup><ProjectReference Include="../backend/EscalaLivre.Api/EscalaLivre.Api.csproj" /></ItemGroup></Project>`);
 write(path.join(bench,'Program.cs'),String.raw`using System.Diagnostics;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using EscalaLivre.Application.Contracts;
using EscalaLivre.Domain.Scheduling;
using EscalaLivre.Infrastructure.Solver;
#if !LEGACY
using EscalaLivre.Api;
using EscalaLivre.Application.Scheduling;
using Microsoft.Extensions.DependencyInjection;
#endif
CultureInfo.CurrentCulture = CultureInfo.InvariantCulture;
var options = ScheduleJson.CreateOptions();
using var fixtures = JsonDocument.Parse(File.ReadAllText(args[0]));
var scenario = fixtures.RootElement.GetProperty("scenarios").EnumerateArray().Single(s => s.GetProperty("id").GetString() == args[1]);
var request = scenario.GetProperty("request").Deserialize<ScheduleRequest>(options)!;
var before = JsonSerializer.Serialize(request, options);
Func<ScheduleRequest, ScheduleResult> calculate;
#if LEGACY
var legacy = new OrToolsScheduleSolver();
calculate = args[2] == "solve" ? legacy.Solve : legacy.Analyze;
#else
using var services = new ServiceCollection().AddScheduleAnalysis().AddScheduleOptimization().BuildServiceProvider();
calculate = args[2] == "solve" ? services.GetRequiredService<GenerateSchedule>().Execute : services.GetRequiredService<AnalyzeSchedule>().Execute;
#endif
var cold = Stopwatch.StartNew();
calculate(request);cold.Stop(); // One warm-up; each measured sample uses its own fresh process.
GC.Collect();GC.WaitForPendingFinalizers();GC.Collect();
long allocated = GC.GetTotalAllocatedBytes(true);
var timer = Stopwatch.StartNew();
var result = calculate(request);
timer.Stop();
allocated = GC.GetTotalAllocatedBytes(true) - allocated;
if (JsonSerializer.Serialize(request, options) != before) throw new Exception("Request mutated");
using var process = Process.GetCurrentProcess();process.Refresh();
Console.WriteLine(JsonSerializer.Serialize(new {
    scenario = args[1], operation = args[2], coldMs = cold.Elapsed.TotalMilliseconds, elapsedMs = timer.Elapsed.TotalMilliseconds,
    allocatedManagedBytes = allocated, peakWorkingSetBytes = process.PeakWorkingSet64, privateBytes = process.PrivateMemorySize64,
    modelVariables = BenchmarkModelProbe.Variables, modelConstraints = BenchmarkModelProbe.Constraints, modelSerializedBytes = BenchmarkModelProbe.SerializedBytes,
    status = result.Optimization?.Status, score = result.CoverageScore, assignmentCount = result.Assignments.Count,
    conflicts = result.Conflicts.Select(i => new { i.Code, i.Severity, i.EmployeeId, i.Start, i.End, i.Role }),
    analyzeSha256 = args[2] == "analyze" ? Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(result, options)))) : null
}, new JsonSerializerOptions(JsonSerializerDefaults.Web)));
`);
 console.log('BUILD '+version);
 const build=command('dotnet',['build',path.join(bench,'Bench.csproj'),'-c','Release'],{cwd:path.join(output,version)});
 write(path.join(output,version+'-build.txt'),build);
}
const fixtures=JSON.parse(fs.readFileSync(path.join(root,'shared/rule-scenarios.json'),'utf8'));
const cases=['baseline-eight-work-hours','four-hours-no-legal-break'];
if(cases.some(id=>!fixtures.scenarios.some(s=>s.id===id&&s.generate)))throw Error('Benchmark cases missing');
const hashes=JSON.parse(fs.readFileSync(path.join(root,'shared/analysis-baseline-hashes.json'),'utf8'));
const raw=[];
const environment={...process.env,DOTNET_PROCESSOR_COUNT:'1',OMP_NUM_THREADS:'1',DOTNET_TieredCompilation:'0',TZ:'America/Cuiaba'};
for(const scenario of cases)for(const operation of ['analyze','solve'])for(let pair=0;pair<5;pair++){
 for(const version of (pair%2===0?['baseline','final']:['final','baseline'])){
  const stdout=command('dotnet',[path.join(output,version,'Bench/bin/Release/net10.0/Bench.dll'),path.join(output,version,'shared/rule-scenarios.json'),scenario,operation],{env:environment});
  const row={version,pair,...JSON.parse(stdout.trim().split(/\r?\n/).at(-1))};
  if(operation==='analyze'&&row.analyzeSha256!==hashes.find(s=>s.id===scenario).sha256)throw Error('Frozen response differs in '+version+' '+scenario);
  if(operation==='solve'&&(!['optimal','feasible'].includes(row.status)||row.conflicts.some(i=>i.severity==='error')))throw Error('Invalid measured schedule');
  raw.push(row);write(path.join(output,'samples.json'),JSON.stringify(raw,null,2));
 }
 console.log('PAIR '+scenario+' '+operation+' '+(pair+1)+'/5');
}
const summary=[];
for(const scenario of cases)for(const operation of ['analyze','solve']){
 const sample=raw.filter(r=>r.scenario===scenario&&r.operation===operation),entry={scenario,operation,metrics:{}};
 for(const metric of ['elapsedMs','allocatedManagedBytes','peakWorkingSetBytes','privateBytes','modelVariables','modelConstraints','modelSerializedBytes']){
  const stats=version=>{const values=sample.filter(r=>r.version===version).map(r=>r[metric]).sort((a,b)=>a-b);return {min:values[0],median:values[2],max:values[4]};};
  const baseline=stats('baseline'),final=stats('final');entry.metrics[metric]={baseline,final,exceedsObservedBaselineMaximum:final.median>baseline.max};
 }
 summary.push(entry);
}
const metadata={baselineRevision:revision,generatedAtUtc:new Date().toISOString(),platform:os.platform(),release:os.release(),architecture:os.arch(),cpu:os.cpus()[0].model,logicalProcessors:os.cpus().length,
 node:process.version,dotnet:command('dotnet',['--version']).trim(),runtime:command('dotnet',['--list-runtimes']).trim(),environment:{DOTNET_PROCESSOR_COUNT:1,OMP_NUM_THREADS:1,DOTNET_TieredCompilation:0,TZ:'America/Cuiaba'},
 fixtureSha256:sha(fs.readFileSync(path.join(root,'shared/rule-scenarios.json'))),sourceManifest:manifest,
 method:'Retrospective matched replay: five fresh processes per version/case/operation, one warm-up plus one measurement each, alternating order. Core calls only; no HTTP/queue startup. Symmetric model-count instrumentation in isolated source copies.',
 limitations:['Two small existing scenarios; not representative of maximum production load.','No historical controlled performance samples exist; this reconstructs the baseline revision today.','Peak working set is the process high-water mark including initialization/warm-up; managed allocation excludes native allocation.','Observed baseline maxima are review flags, not calibrated CI pass/fail thresholds.','D1 and generation admission intentionally changed between revisions; solver model growth is not a refactoring-only regression.']};
write(path.join(output,'results.json'),JSON.stringify({metadata,summary,samples:raw},null,2));
console.log(JSON.stringify(summary,null,2));
