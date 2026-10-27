// Builds the current pure application probe. Never treats an old binary as source validation.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const {digest}=require('../shared/parity-contract.cjs');
const {corpus,generated}=require('../shared/parity-corpus.cjs');
const load=require('../frontend/tests/source-loader.cjs')();
const {analyzeDocument}=load('lib/analysis.ts');
const {migrateDocument}=load('lib/documentLifecycle.ts');
const {replacePeriodAssignments}=load('lib/scheduleWindow.ts');
const plain=v=>JSON.parse(JSON.stringify(v));
function args(){const result={};for(let i=2;i<process.argv.length;i+=2){const name=process.argv[i];if(!['--case','--seed','--input','--output'].includes(name)||!process.argv[i+1])throw new Error('Expected --case ID, --seed UINT32, --input failure.json or --output directory');result[name.slice(2)]=process.argv[i+1];}return result;}
function probe(requests){
 const run=spawnSync('dotnet',[path.join(root,'tools/EscalaLivre.ParityProbe/bin/Release/net10.0/EscalaLivre.ParityProbe.dll')],{cwd:root,input:JSON.stringify(requests),encoding:'utf8',timeout:60000,maxBuffer:32*1024*1024,windowsHide:true});
 if(run.error||run.status!==0)throw new Error('C# probe failed: '+(run.error??run.stderr));
 return JSON.parse(run.stdout);
}
function check(scenario,remote){
 const d=scenario.request.document,before=JSON.stringify(d),local=analyzeDocument(d);
 assert.equal(JSON.stringify(d),before,'TS input mutation');
 assert.deepEqual(digest(remote.analysis),digest(local),'C#/TS analysis');
 assert.deepEqual(digest(remote.validation),digest(local),'C#/TS validation');
 for(const key of ['inputUnchanged','migrationIdempotent','roundTripPreserved','preserveReplacement','preserveExternalHistory'])assert.equal(remote[key],true,'C# '+key);
 const first=migrateDocument(d),second=migrateDocument(first.document);
 assert.deepEqual(digest(analyzeDocument(first.document)),digest(local),'migration preserves analysis');
 assert.deepEqual(plain(second.document),plain(first.document),'migration idempotence');assert.deepEqual(plain(second.applied),[],'migration runs once');
 const shifts=items=>plain(items.map(a=>({...a,break:a.break??null})));
 assert.deepEqual(shifts(first.document.assignments),shifts(d.assignments),'migration preserves civil shifts');
 const selected=d.assignments.filter(a=>a.start.slice(0,10)>=d.planningPeriod.start&&a.start.slice(0,10)<=d.planningPeriod.end);
 const byId=items=>plain(items).sort((a,b)=>a.id.localeCompare(b.id));
 assert.deepEqual(byId(replacePeriodAssignments(d,selected)),byId(d.assignments),'replacement preserves whole shifts and bilateral history');
 assert.equal(JSON.stringify(d),before,'properties mutate input');
 if(scenario.expectedScore!==undefined)assert.equal(local.coverageScore,scenario.expectedScore,'independent score anchor');
 if(scenario.expectedGap)assert.ok(local.gaps.some(g=>JSON.stringify(plain(g))===JSON.stringify(scenario.expectedGap)),'one second gap anchor');
 for(const code of scenario.forbiddenCodes??[])assert.ok(!local.conflicts.some(c=>c.code===code),'unexpected code '+code);
 for(const code of scenario.requiredCodes??[])assert.ok(local.conflicts.some(c=>c.code===code),'missing aggregate anchor '+code);
}
function main(){
 const options=args();let scenarios=options.input?[JSON.parse(fs.readFileSync(options.input,'utf8')).scenario]:options.seed?generated(Number(options.seed)):corpus();
 if(options.case)scenarios=scenarios.filter(s=>s.id===options.case);
 if(!scenarios.length||scenarios.length>256)throw new Error('Select 1..256 cases');
 const build=spawnSync('dotnet',['build','tools/EscalaLivre.ParityProbe/EscalaLivre.ParityProbe.csproj','-c','Release','--no-incremental','--nologo'],{cwd:root,encoding:'utf8',timeout:120000,windowsHide:true});
 process.stdout.write(build.stdout??'');if(build.error||build.status!==0)throw new Error('Current build failed: '+(build.error??build.stderr));
 const results=probe(scenarios.map(s=>s.request));assert.equal(results.length,scenarios.length);
 for(let i=0;i<scenarios.length;i++)try{check(scenarios[i],results[i]);}catch(error){
   const out=path.resolve(options.output??path.join(root,'artifacts/parity'));fs.mkdirSync(out,{recursive:true});
   const file=path.join(out,'failure.json');fs.writeFileSync(file,JSON.stringify({scenario:scenarios[i],csharp:results[i],typescript:plain(analyzeDocument(scenarios[i].request.document)),error:String(error),runtime:{node:process.version,tz:process.env.TZ??Intl.DateTimeFormat().resolvedOptions().timeZone}},null,2));
   throw new Error(scenarios[i].id+': '+error+'; replay: node tools/parity-differential.cjs --input '+file);
 }
 console.log(JSON.stringify({status:'passed',cases:scenarios.length,seeds:require('../shared/parity-corpus.cjs').SEEDS,node:process.version,tz:process.env.TZ??Intl.DateTimeFormat().resolvedOptions().timeZone,properties:['input immutability','migration idempotence','whole-shift preservation','bilateral replacement'],comparison:['diagnostic code/severity/person/period/role','coverage','gaps','score']}));
}
main();
