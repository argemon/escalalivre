// Isolated local browser review. Requires Playwright in artifacts/review-runtime.
// Serves the production build and proxies to a fresh API process; never contacts hosting.
const {chromium}=require('../artifacts/review-runtime/node_modules/playwright');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {randomUUID}=require('node:crypto');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const evidence=path.join(root,'docs/decisions/evidence/publication-review');
fs.mkdirSync(evidence,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fixture=()=>{
  const d=structuredClone(require('../shared/document-validation-scenarios.json').document);
  d.company.name='Revisão local · Escala Livre';
  // The shared validation fixture contains a closed holiday; use an open day
  // here so the generation smoke test exercises actual scheduling work.
  d.company.holidays=[];
  d.planningPeriod={start:'2026-05-18',end:'2026-05-18'};
  return d;
};
const saved=d=>JSON.stringify({version:2,state:{document:d,theme:'light',viewMode:'solver'}});
const results=[];
const selectedCases=process.env.REVIEW_BROWSER_CASES?.split(',');
const reportName=process.env.REVIEW_BROWSER_REPORT??'browser.json';
let api,server,browser,apiLogs='',origin,apiUrl;
async function until(ready,timeout=20000){
  const deadline=Date.now()+timeout;
  while(!(await ready())){assert.ok(Date.now()<deadline,'Timed out waiting for local state');await sleep(50);}
}
async function step(name,run,storage){
  if(selectedCases&&!selectedCases.includes(name))return;
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'pt-BR',timezoneId:'America/Cuiaba',acceptDownloads:true});
  const errors=[];
  await context.addInitScript(entries=>{for(const [key,value] of Object.entries(entries))if(localStorage.getItem(key)===null)localStorage.setItem(key,value);},storage??{'escalalivre-state':saved(fixture())});
  const page=await context.newPage();page.setDefaultTimeout(12000);
  page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(origin,{waitUntil:'networkidle'});
    await run(page);
    assert.deepEqual(errors,[],'No uncaught browser errors');
    await page.screenshot({path:path.join(evidence,name+'.png'),fullPage:true});
    results.push({name,status:'passed',pageErrors:errors});
    console.log('PASS '+name);
  }catch(error){
    await page.screenshot({path:path.join(evidence,name+'-failure.png'),fullPage:true}).catch(()=>{});
    results.push({name,status:'failed',error:error.stack,pageErrors:errors});
    console.log('FAIL '+name+': '+error.message);
  }finally{
    await context.close();
    fs.writeFileSync(path.join(evidence,reportName),JSON.stringify({browser:browser.version(),playwright:require('../artifacts/review-runtime/node_modules/playwright/package.json').version,node:process.version,environment:'Windows; headless Edge; production frontend; local real API/worker',results},null,2));
  }
}
const current=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('escalalivre-state')).state.document);
async function tools(page){await page.locator('details.header-tools > summary').click();}
async function editCompany(page,name){
  await page.getByRole('button',{name:'Configurar empresa',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Configurar empresa',exact:true});
  await dialog.getByLabel('Nome da empresa',{exact:true}).fill(name);
  await dialog.getByRole('button',{name:'Salvar alterações',exact:true}).click();
  await dialog.waitFor({state:'hidden'});
}
async function downloadText(download){
  const stream=await download.createReadStream();const chunks=[];
  for await(const chunk of stream)chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}
async function blocker(){
  const d=fixture(),base=d.employees[0];delete d.roles;
  d.employees=Array.from({length:200},()=>({...structuredClone(base),id:randomUUID(),roleId:undefined,coverageRoleIds:undefined,coverageRoles:undefined}));
  d.company.coverage=Array.from({length:1000},(_,i)=>({role:'Other'+i,day:1,start:'08:00:00',end:'18:00:00',minimumEmployees:200}));
  d.assignments=d.employees.map(e=>({id:randomUUID(),employeeId:e.id,role:e.role,start:'2026-05-18T08:00:00',end:'2026-05-18T18:00:00',break:{start:'2026-05-18T12:00:00',end:'2026-05-18T13:00:00'},source:'manual',tags:[]}));
  const before=apiLogs.length,abort=new AbortController();
  const response=fetch(apiUrl+'/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({document:d,start:'2026-05-18T00:00:00',end:'2026-05-18T23:59:59'}),signal:abort.signal}).catch(()=>null);
  await until(()=>apiLogs.slice(before).includes('Calculation analyze started'));
  return async()=>{abort.abort();await response;await until(()=>apiLogs.slice(before).includes('Calculation analyze completed'));};
}
async function main(){
  const reservation=http.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));
  const apiPort=reservation.address().port;await new Promise(r=>reservation.close(r));
  apiUrl='http://127.0.0.1:'+apiPort;
  api=spawn('dotnet',[path.join(root,'backend/EscalaLivre.Api/bin/Release/net10.0/EscalaLivre.Api.dll')],{cwd:path.join(root,'backend/EscalaLivre.Api'),windowsHide:true,env:{...process.env,ASPNETCORE_ENVIRONMENT:'Production',ASPNETCORE_URLS:apiUrl,Protection__RequestsPerMinute:'1000',Protection__SolvesPerMinute:'1000','Logging__LogLevel__EscalaLivre.Api.CalculationWorker':'Debug'}});
  api.stdout.on('data',b=>{apiLogs+=b;});api.stderr.on('data',b=>{apiLogs+=b;});
  await until(async()=>{assert.equal(api.exitCode,null,'API must remain running');try{return(await fetch(apiUrl+'/health')).ok;}catch{return false;}});
  server=http.createServer((req,res)=>{
    if(/^\/(solve|health|analyze|validate|import|export)(\/|$|\?)/i.test(req.url)){
      const upstream=http.request(apiUrl+req.url,{method:req.method,headers:{...req.headers,host:'127.0.0.1:'+apiPort}},answer=>{res.writeHead(answer.statusCode,answer.headers);answer.pipe(res);});
      upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.pipe(upstream);return;
    }
    const requested=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=path.resolve(root,'frontend/dist','.'+requested);
    if(!file.startsWith(path.join(root,'frontend/dist')+path.sep)&&requested!=='/'){res.writeHead(403);res.end();return;}
    const selected=fs.existsSync(file)&&fs.statSync(file).isFile()?file:path.join(root,'frontend/dist/index.html');
    const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'}[path.extname(selected)]??'application/octet-stream';
    res.setHeader('Content-Type',mime);fs.createReadStream(selected).pipe(res);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({executablePath:process.env.REVIEW_BROWSER_PATH??'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});

  await step('browser-generation',async page=>{
    const accepted=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/solve/jobs');
    await page.getByRole('button',{name:'Gerar escala',exact:true}).click();
    assert.equal((await accepted).status(),202);
    await page.getByRole('button',{name:'Gerar escala',exact:true}).waitFor({state:'visible',timeout:25000});
    // Retained manual shifts may already be the optimum; no exact solution/source assertion.
    await page.getByText(/^(Ótimo comprovado|Solução viável)$/).first().waitFor({timeout:25000});
    assert.ok((await current(page)).assignments.length>0);
  });

  await step('browser-cancellation',async page=>{
    const previous=await current(page),release=await blocker();
    try{
      const accepted=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/solve/jobs');
      await page.getByRole('button',{name:'Gerar escala',exact:true}).click();
      const progress=(await(await accepted).json()).data;assert.equal(progress.state,'queued');
      const cancelled=page.waitForResponse(r=>r.request().method()==='DELETE'&&new URL(r.url()).pathname.startsWith('/solve/jobs/'));
      await page.getByRole('button',{name:'Cancelar geração',exact:true}).click();
      // Cancellation of a processing runner is published only after its exit.
      assert.ok(['processing','cancelled'].includes((await(await cancelled).json()).data.state));
      await page.getByText('Geração cancelada. Seus turnos foram mantidos.',{exact:true}).waitFor({timeout:20000});
      assert.deepEqual((await current(page)).assignments,previous.assignments);
    }finally{await release();}
  });

  await step('browser-edit-during-wait',async page=>{
    const previous=await current(page);
    const accepted=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/solve/jobs');
    await page.getByRole('button',{name:'Gerar escala',exact:true}).click();await accepted;
    await editCompany(page,'Editado durante a espera');
    await page.getByText('O planejamento mudou durante a espera. Gere novamente para usar os dados atuais.',{exact:true}).waitFor({timeout:25000});
    const after=await current(page);assert.equal(after.company.name,'Editado durante a espera');assert.deepEqual(after.assignments,previous.assignments);
  });

  await step('browser-import-export',async page=>{
    await tools(page);
    const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar',exact:true}).first().click();
    const exported=JSON.parse(await downloadText(await downloading));assert.equal(exported.company.name,fixture().company.name);
    const changed=structuredClone(exported);changed.company.name='Arquivo importado na revisão';
    page.once('dialog',d=>d.accept());
    await page.locator('input[type=file]').first().setInputFiles({name:'review.escalalivre',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(changed))});
    await page.getByRole('heading',{name:changed.company.name,exact:true}).first().waitFor();
    const before=await current(page);
    const invalid=structuredClone(changed);invalid.employees=Array(201).fill(null);
    const alert=page.waitForEvent('dialog');
    await page.locator('input[type=file]').first().setInputFiles({name:'invalid.escalalivre',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});
    const error=await alert;assert.match(error.message(),/inválido/i);await error.accept();
    assert.deepEqual(await current(page),before);
    assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('escalalivre-recovery')))).copies.length>0,true);
  });

  const backup=fixture(),broken='{"state": broken JSON';backup.company.name='Planejamento recuperado';
  await step('browser-recovery',async page=>{
    assert.equal(await page.evaluate(()=>localStorage.getItem('escalalivre-state')),broken);
    await page.getByRole('heading',{name:backup.company.name,exact:true}).first().waitFor();
    await tools(page);
    const original=page.locator('li').filter({hasText:'Conteúdo original do navegador'}).first();
    const downloading=page.waitForEvent('download');await original.getByRole('button',{name:'Baixar cópia',exact:true}).click();
    assert.equal(await downloadText(await downloading),broken);
    await page.getByRole('button',{name:'Restaurar cópia',exact:true}).first().click();
    await until(async()=>{try{return(await current(page)).company.name===backup.company.name;}catch{return false;}});
    assert.equal((await current(page)).company.name,backup.company.name);
  },{'escalalivre-state':broken,'escalalivre-recovery':JSON.stringify({version:1,copies:[{contents:JSON.stringify(backup),reason:'Cópia de revisão'}]})});

  await step('browser-print',async page=>{
    await page.getByRole('button',{name:'Imprimir',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Imprimir escala da equipe',exact:true});await dialog.waitFor();
    assert.ok(await dialog.getByRole('cell').count()>0);
    await page.evaluate(()=>{window.__reviewPrint=false;window.addEventListener('beforeprint',()=>{window.__reviewPrint=true;});});
    await dialog.getByRole('button',{name:'Imprimir / Salvar PDF',exact:true}).click();
    await until(()=>page.evaluate(()=>window.__reviewPrint));
    await page.emulateMedia({media:'print'});
    assert.equal(await page.locator('.schedule-print-controls').isVisible(),false);
    assert.equal(await page.locator('.schedule-print-table').isVisible(),true);
    await page.screenshot({path:path.join(evidence,'browser-print-media.png'),fullPage:true});
    if(process.env.REVIEW_PRINT_PDF){
      fs.mkdirSync(path.dirname(process.env.REVIEW_PRINT_PDF),{recursive:true});
      await page.pdf({path:process.env.REVIEW_PRINT_PDF,format:'A4',landscape:true,printBackground:true,displayHeaderFooter:false,margin:{top:'10mm',bottom:'10mm',left:'10mm',right:'10mm'}});
    }
    await page.emulateMedia({media:'screen'});
  });

  const large=fixture();large.company.name='Planejamento local maior que 1 MiB';
  large.assignments=Array.from({length:110},()=>({...large.assignments[0],id:randomUUID(),tags:Array.from({length:50},()=> 'a'.repeat(256))}));
  await step('browser-large-local-document',async page=>{
    assert.ok(Buffer.byteLength(JSON.stringify(large))>1048576);
    await page.getByRole('heading',{name:large.company.name,exact:true}).first().waitFor();
    await page.reload({waitUntil:'networkidle'});
    assert.equal((await current(page)).assignments.length,110);
    await page.getByRole('heading',{name:large.company.name,exact:true}).first().waitFor();
  },{'escalalivre-state':saved(large)});

  // Bounded local load against real workers, independent of browser state.
  // IDs stay in memory only; do not persist bearer tickets in the evidence.
  if(selectedCases&&!selectedCases.includes('local-history'))return;
  const jobs=[],loadStarted=Date.now();
  for(let i=0;i<40;i++){
    const accepted=await fetch(apiUrl+'/solve/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({document:fixture(),start:'2026-05-18T00:00:00',end:'2026-05-18T23:59:59'})});
    assert.equal(accepted.status,202,'Completed history must not block real admission');
    const id=(await accepted.json()).data.id;jobs.push(id);
    await until(async()=>{
      const response=await fetch(apiUrl+'/solve/jobs/'+id);assert.equal(response.status,200);
      const progress=(await response.json()).data;
      assert.notEqual(progress.state,'failed',progress.error);
      return progress.state==='completed';
    });
  }
  for(const id of jobs){
    const response=await fetch(apiUrl+'/solve/jobs/'+id);assert.equal(response.status,200);
    const retained=(await response.json()).data;assert.equal(retained.state,'completed');assert.ok(retained.result);
  }
  fs.writeFileSync(path.join(evidence,'local-history.json'),JSON.stringify({status:'passed',completedJobs:40,resultsStillQueryable:40,submissionConcurrency:1,configuredWorkers:1,payloadBudgetMiB:128,retainedTicketLimit:1024,elapsedSeconds:(Date.now()-loadStarted)/1000,scope:'Local API/real worker; not a capacity certification or hosted load test'},null,2));
  console.log('PASS local-history-40-real-completions');
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();
  if(server)await new Promise(r=>server.close(r));
  if(api){api.kill();if(api.exitCode===null)await once(api,'exit');}
  if(results.some(r=>r.status!=='passed'))process.exitCode=1;
});
