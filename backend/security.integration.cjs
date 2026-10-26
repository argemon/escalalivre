// Run after dotnet build: node backend/security.integration.cjs
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const net = require('node:net');

const apiDirectory = path.join(__dirname, 'EscalaLivre.Api');
const assembly = path.join(apiDirectory, `bin/${process.env.SECURITY_BUILD_CONFIGURATION || 'Debug'}/net10.0/EscalaLivre.Api.dll`);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('asynchronous generation returns a private ticket, survives polling and supports cancellation', async () => {
  await withServer({}, async ({url, post}) => {
    assert.equal((await post('/solve/jobs', {})).status, 400);
    assert.equal((await fetch(url + '/solve/jobs/' + '0'.repeat(64))).status, 404);
    const accepted = await post('/solve/jobs', request(3, 1));
    assert.equal(accepted.status, 202);
    const first = (await accepted.json()).data;
    assert.match(first.id, /^[0-9a-f]{64}$/);
    const second = (await (await post('/solve/jobs', request())).json()).data;
    assert.notEqual(second.id, first.id);
    assert.equal(second.result, null);
    const cancelled = await fetch(url + '/solve/jobs/' + second.id, {method:'DELETE', headers:{Origin:'https://allowed.example'}});
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.headers.get('access-control-allow-origin'), 'https://allowed.example');
    let result;
    for(let i=0;i<100;i++) {
      result=(await (await fetch(url+'/solve/jobs/'+first.id)).json()).data;
      if(['completed','failed'].includes(result.state))break;
      await sleep(200);
    }
    assert.equal(result.state, 'completed', result.error);
    assert.ok(result.result.assignments.length);
    assert.equal((await (await fetch(url+'/solve/jobs/'+second.id)).json()).data.state, 'cancelled');
    assert.equal((await fetch(url+'/health')).status, 200);
  });
});
function request(people = 1, days = 1) {
  const workload = { regimeType: 'dayBased', workUnits: 7, restUnits: 0, weeklyLimitHours: 44, defaultShiftDuration: '08:00:00' };
  return {
    start: '2026-10-19T00:00:00', end: `2026-10-${18 + days}T23:59:59`,
    document: {
      schemaVersion: '1.0.0', id: randomUUID(), updatedAt: new Date().toISOString(),
      company: { name: 'ConfidentialCompany', opensAt: '08:00:00', closesAt: '18:00:00', operatingDays: [0,1,2,3,4,5,6],
        defaultWorkload: workload, minimumRest: '11:00:00', lunch: { minimum: '01:00:00', maximum: '01:00:00', preferredAfter: '04:00:00' },
        coverage: [0,1,2,3,4,5,6].map(day => ({ role: 'Atendimento', day, start: '08:00:00', end: '18:00:00', minimumEmployees: 1 })) },
      employees: Array.from({ length: people }, () => ({ id: randomUUID(), name: 'ConfidentialPerson', role: 'Atendimento',
        inheritsCompanyDefaults: true, workload, availability: [], restrictions: [], preferences: [], allowsOvertime: false,
        allowsNightWork: false, preferredDaysOff: [] })), assignments: []
    }
  };
}
function expensiveAnalysis() {
  const r = request(200);
  r.document.company.coverage = Array.from({ length: 1000 }, (_, i) => ({
    role: 'OtherRole' + i, day: 1, start: '08:00:00', end: '18:00:00', minimumEmployees: 200
  }));
  r.document.assignments = r.document.employees.map(person => ({
    id: randomUUID(), employeeId: person.id, role: person.role, start: '2026-10-19T08:00:00', end: '2026-10-19T18:00:00',
    break: { start: '2026-10-19T12:00:00', end: '2026-10-19T13:00:00' }, source: 'manual', tags: []
  }));
  return r;
}
async function withServer(options, run) {
  const portServer = net.createServer();
  await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve));
  const port = portServer.address().port;
  await new Promise(resolve => portServer.close(resolve));
  const url = `http://127.0.0.1:${port}`;
  const env = { ...process.env, ASPNETCORE_ENVIRONMENT: 'Production', ASPNETCORE_URLS: url,
    Protection__AllowedOrigins__0: 'https://allowed.example', Protection__RequestsPerMinute: '1000', Protection__SolvesPerMinute: '1000',
    Logging__LogLevel__Default: 'Information', 'Logging__LogLevel__EscalaLivre.Api.CalculationWorker': 'Debug' };
  for (const [key, value] of Object.entries(options)) env[`Protection__${key}`] = String(value);
  const child = spawn('dotnet', [assembly], { cwd: apiDirectory, env, windowsHide: true });
  let logs = '';
  child.stdout.on('data', b => { logs += b.toString(); });
  child.stderr.on('data', b => { logs += b.toString(); });
  const post = (route, data, extra = {}) => fetch(url + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: typeof data === 'string' ? data : JSON.stringify(data) });
  try {
    let ready = false;
    for (let i = 0; i < 150; i++) {
      if (child.exitCode !== null) throw new Error('Server exited: ' + logs);
      try { if ((await fetch(url + '/health')).ok) { ready = true; break; } } catch { }
      await sleep(100);
    }
    assert.ok(ready, 'Server must start');
    const waitForLog = async message => {
      const deadline = Date.now() + 10000;
      while (!logs.includes(message)) {
        assert.equal(child.exitCode, null, 'Server must remain running');
        assert.ok(Date.now() < deadline, 'Missing server event: ' + message);
        await sleep(20);
      }
    };
    await run({ url, post, logs: () => logs, waitForLog });
  } catch (error) {
    throw new Error(error.stack + '\nServer output:\n' + logs);
  } finally {
    child.kill();
    if (child.exitCode === null) await once(child, 'exit');
  }
}

test('API rejects abusive inputs and keeps normal scheduling and exports working', async () => {
  await withServer({}, async ({ url, post, logs }) => {
    const r = request();
    const solved = await post('/solve', r);
    assert.equal(solved.status, 200);
    assert.ok((await solved.json()).data.assignments.length);
    for (const endpoint of ['/validate', '/analyze']) assert.equal((await post(endpoint, r)).status, 200);
    for (const format of ['native', 'xlsx', 'pdf']) assert.equal((await post('/export', { document: r.document, format })).status, 200);
    const exported = await (await post('/export', { document: r.document, format: 'native' })).json();
    const imported = await post('/import', { fileName: 'x.escalalivre', format: 'native', contentBase64: exported.data.contentBase64 });
    assert.equal(imported.status, 200);
    for (const content of ['{', 'null', '{}', JSON.stringify({ document: null, start: r.start, end: r.end })]) {
      const invalid = await post('/solve', content);
      assert.equal(invalid.status, 400);
      assert.equal((await invalid.json()).success, false);
    }
    for (const owner of ['company', 'employee']) {
      const unknown = request();
      const rule = owner === 'company' ? unknown.document.company.defaultWorkload : unknown.document.employees[0].workload;
      rule.regimeType = 'unregistered';
      const response = await post('/analyze', unknown);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).success, false);
    }
    for (const contentBase64 of ['bad base64', 'e30=', 'bnVsbA=='])
      assert.equal((await post('/import', { fileName: 'x.escalalivre', format: 'native', contentBase64 })).status, 400);
    assert.equal((await post('/export', { document: null, format: 'native' })).status, 400);
    for(let attempt=0;attempt<5;attempt++){
      const tooLarge = await post('/import', JSON.stringify({ pad: 'x'.repeat((attempt===4?4:2) * 1024 * 1024) }), {Origin:'https://allowed.example'});
      assert.equal(tooLarge.status, 413);
      assert.equal(tooLarge.headers.get('access-control-allow-origin'),'https://allowed.example');
      assert.equal((await tooLarge.json()).success,false);
    }
    assert.equal((await post('/solve', request())).status,200);
    const allowed = await fetch(url + '/health', { headers: { Origin: 'https://allowed.example' } });
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://allowed.example');
    assert.equal(allowed.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(allowed.headers.get('server'), null);
    const denied = await fetch(url + '/health', { headers: { Origin: 'https://evil.example' } });
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
    assert.ok(!logs().includes('ConfidentialPerson'));
    assert.ok(!logs().includes('ConfidentialCompany'));
  });
});

test('solve limit cannot be bypassed by forging a forwarded IP or changing path case', async () => {
  await withServer({ SolvesPerMinute: 1 }, async ({ post }) => {
    assert.equal((await post('/solve', request())).status, 200);
    const blocked = await post('/SOLVE', request(), { 'X-Forwarded-For': '1.2.3.4' });
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    assert.equal((await blocked.json()).errors[0].code, 'rateLimited');
  });
});

test('global per-IP rate limit includes invalid requests', async () => {
  await withServer({ RequestsPerMinute: 3 }, async ({ post }) => {
    assert.equal((await post('/import', '{}')).status, 400);
    assert.equal((await post('/import', '{}')).status, 400);
    assert.equal((await post('/import', '{}')).status, 429);
  });
});

test('bounded queue rejects excess jobs while the API remains responsive', async () => {
  await withServer({ ConcurrentWorkers: 1, QueueLimit: 0, WorkerTimeoutSeconds: 1 }, async ({ url, post }) => {
    const heavy = request(200, 7);
    heavy.document.company.lunch.maximum = '02:00:00';
    const jobs = Array.from({ length: 4 }, () => post('/solve', heavy));
    const results = await Promise.all(jobs);
    assert.ok(results.some(r => r.status === 503));
    assert.ok(results.every(r => [422, 503, 504].includes(r.status)), results.map(r => r.status).join(','));
    assert.equal((await fetch(url + '/health')).status, 200);
    // Verify the released slot within the unchanged 1s budget, without requiring cold native startup under 1s.
    // Generation recovery with the normal production budget is covered by the other worker tests.
    const recovered = await post('/analyze', request());
    assert.equal(recovered.status, 200);
    assert.equal((await recovered.json()).success, true);
  });
});

test('wall-clock deadline includes result analysis and the API recovers', async () => {
  await withServer({ ConcurrentWorkers: 1, QueueLimit: 0, WorkerTimeoutSeconds: 1 }, async ({ url, post }) => {
    const response = await post('/analyze', expensiveAnalysis());
    assert.equal(response.status, 504);
    assert.equal((await response.json()).errors[0].code, 'calculationTimeout');
    assert.equal((await fetch(url + '/health')).status, 200);
    // Probe the released analysis slot with the same operation and deadline.
    // Cold native solver startup has its own integration tests and no subsecond contract.
    const recovered = await post('/analyze', request());
    assert.equal(recovered.status, 200);
    assert.equal((await recovered.json()).success, true);
  });
});

test('queue wait has its own deadline and cancellation removes the active job', async () => {
  await withServer({ ConcurrentWorkers: 1, QueueLimit: 1, QueueWaitSeconds: 1 }, async ({ url, post, waitForLog }) => {
    const abort = new AbortController();
    const running = fetch(url + '/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(expensiveAnalysis()), signal: abort.signal });
    const rejected = assert.rejects(running);
    try {
      // Validation can take longer on CI; wait until the worker owns its slot.
      await waitForLog('Calculation analyze started');
      const waiting = await post('/solve', request());
      assert.equal(waiting.status, 503);
      assert.equal((await waiting.json()).errors[0].code, 'busy');
    } finally { abort.abort(); await rejected; }
    await waitForLog('Calculation analyze completed');
    assert.equal((await post('/solve', request())).status, 200);
  });
});

test('disconnecting the caller stops its worker and releases capacity', async () => {
  await withServer({ ConcurrentWorkers: 1, QueueLimit: 0 }, async ({ url, post, waitForLog }) => {
    const heavy = request(200, 7);
    const abort = new AbortController();
    const running = fetch(url + '/solve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(heavy), signal: abort.signal });
    const rejected = assert.rejects(running);
    try { await waitForLog('Calculation solve started'); }
    finally { abort.abort(); await rejected; }
    await waitForLog('Calculation solve completed');
    assert.equal((await post('/solve', request())).status, 200);
  });
});

test('memory watchdog stops the child and releases its slot', async () => {
  await withServer({ WorkerMemoryMb: 64 }, async ({ url, post }) => {
    const response = await post('/solve', request(200, 7));
    assert.equal(response.status, 422);
    assert.equal((await response.json()).errors[0].code, 'complexityLimit');
    assert.equal((await fetch(url + '/health')).status, 200);
  });
});

test('an unfinished request body cannot occupy an API slot indefinitely', async () => {
  await withServer({ WorkerTimeoutSeconds: 1, QueueWaitSeconds: 1 }, async ({ url }) => {
    const target = new URL(url);
    const started = Date.now();
    const status = await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: target.hostname, port: Number(target.port) });
      let sending;
      const deadline = setTimeout(() => { clearInterval(sending); socket.destroy(); reject(new Error('Request body deadline was not enforced')); }, 11000);
      const finish = () => { clearTimeout(deadline); clearInterval(sending); };
      socket.on('error', error => { finish(); if (error.code === 'ECONNRESET') resolve(0); else reject(error); });
      socket.on('close', () => { finish(); resolve(0); });
      socket.on('data', data => { finish(); socket.destroy(); resolve(Number(data.toString().split(' ')[1])); });
      socket.on('connect', () => {
        socket.write('POST /import HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 100000\r\n\r\n{"pad":"');
        // Above the server's minimum byte rate, but never finish the JSON body.
        sending = setInterval(() => socket.write('x'.repeat(256)), 300);
      });
    });
    assert.ok(status === 504 || status === 0, 'The server must time out or close the unfinished request');
    assert.ok(Date.now() - started >= 6500, 'The request must reach its configured deadline');
    assert.equal((await fetch(url + '/health')).status, 200);
  });
});

test('civil 09h and overnight dates survive the HTTP API, worker and native round trip', async () => {
  await withServer({}, async ({ post }) => {
    const r=request();r.document.company.timeZone='America/Cuiaba';
    const shift={id:randomUUID(),employeeId:r.document.employees[0].id,role:'Atendimento',start:'2026-10-19T09:00:00',end:'2026-10-19T18:00:00',break:{start:'2026-10-19T13:00:00',end:'2026-10-19T14:00:00'},source:'manual',tags:[]};
    r.document.assignments=[shift];
    for(const route of ['/validate','/analyze']){
      const response=await post(route,r);assert.equal(response.status,200);
      const body=await response.json();assert.equal(body.data.assignments[0].start,shift.start);assert.equal(body.data.assignments[0].break.start,shift.break.start);
    }
    const exported=await (await post('/export',{document:r.document,format:'native'})).json();
    const imported=await (await post('/import',{fileName:'time.escalalivre',format:'native',contentBase64:exported.data.contentBase64})).json();
    assert.equal(imported.data.assignments[0].start,shift.start);
    r.document.assignments[0]={...shift,start:'2026-10-19T13:00:00Z',end:'2026-10-19T22:00:00Z',break:{start:'2026-10-19T17:00:00Z',end:'2026-10-19T18:00:00Z'}};
    r.start='2026-10-19T04:00:00Z';r.end='2026-10-20T03:59:59Z';
    const legacy=await post('/analyze',r);assert.equal(legacy.status,200);
    assert.equal((await legacy.json()).data.assignments[0].start,'2026-10-19T09:00:00');
    r.document.assignments[0]={...shift,start:'2026-10-20T02:00:00Z',end:'2026-10-20T10:00:00Z',break:{start:'2026-10-20T06:00:00Z',end:'2026-10-20T07:00:00Z'}};
    const night=await post('/analyze',r);assert.equal(night.status,200);
    const a=(await night.json()).data.assignments[0];
    assert.equal(a.start,'2026-10-19T22:00:00');assert.equal(a.end,'2026-10-20T06:00:00');assert.equal(a.break.start,'2026-10-20T02:00:00');
  });
});

test('shared documents produce equivalent browser and HTTP diagnostics, coverage and gaps', async () => {
  const load=require('../frontend/tests/source-loader.cjs')();
  const {analyzeDocument}=load('lib/analysis.ts');
  const scenarios=require('../shared/rule-scenarios.json').scenarios;
  const ordered=rows=>Array.from(rows,row=>JSON.stringify(row)).sort();
  const digest=result=>({
    conflicts:ordered(result.conflicts.map(c=>({code:c.code,severity:c.severity,start:c.start??null,end:c.end??null,role:c.role??null,employeeId:c.employeeId??null}))),
    coverage:ordered(result.coverage.map(c=>({start:c.start,end:c.end,role:c.role,required:c.required,assigned:c.assigned,state:c.state}))),
    gaps:ordered(result.gaps.map(g=>({start:g.start,end:g.end,role:g.role,missingEmployees:g.missingEmployees}))),score:result.coverageScore
  });
  await withServer({},async({post})=>{
    for(const scenario of scenarios.filter(s=>s.apiValid)) {
      const local=digest(analyzeDocument(scenario.request.document));
      for(const endpoint of ['/analyze','/validate']) {
        const response=await post(endpoint,scenario.request);assert.equal(response.status,200,scenario.id+' '+endpoint);
        const envelope=await response.json();assert.deepEqual(digest(envelope.data),local,scenario.id+' '+endpoint);
      }
      if(scenario.generate){
        const response=await post('/solve',scenario.request);assert.equal(response.status,200,scenario.id+' /solve');
        const {data:result}=await response.json();assert.ok(result.assignments.length,scenario.id);assert.ok(!result.conflicts.some(c=>c.severity==='error'),scenario.id+': '+JSON.stringify(result.conflicts));
        const checked=analyzeDocument({...scenario.request.document,assignments:result.assignments});assert.deepEqual(digest(result),digest(checked),scenario.id+' generated diagnostics');
      }
    }
  });
});

// App save actions, persisted reload, actual HTTP/worker generation, and result application.
function editingFixture() {
  const r=request();
  const own={id:randomUUID(),name:'Farmacêutico'},covered={id:randomUUID(),name:'Atendente'};
  r.document.roles=[own,covered];
  r.document.planningPeriod={start:'2026-10-14',end:'2026-10-14'};
  r.document.company={...r.document.company,timeZone:'America/Cuiaba',opensAt:'07:30:00',closesAt:'16:30:00',operatingDays:[3],
    coverage:[{role:covered.name,roleId:covered.id,day:3,start:'11:00:00',end:'13:00:00',minimumEmployees:1}]};
  const base=r.document.employees[0];
  r.document.employees=[
    {...base,role:own.name,roleId:own.id,coverageRoleIds:[],coverageRoles:[],shiftStartsAt:'07:30:00',fixedInterval:{start:'11:00:00',end:'12:00:00'}},
    {...base,id:randomUUID(),role:covered.name,roleId:covered.id,coverageRoleIds:[],coverageRoles:[],shiftStartsAt:'07:30:00',fixedInterval:{start:'12:00:00',end:'13:00:00'}},
  ];
  return {document:r.document,covered,employeeId:base.id};
}
function editingClient(url) {
  const data=new Map();
  const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
  let load,store,payload;
  const reload=()=>{
    load=require('../frontend/tests/source-loader.cjs')(storage,{fetch:async(route,options)=>{
      payload=JSON.parse(options.body);
      return fetch(url+route,options);
    }});
    store=load('store/scheduleStore.ts').useScheduleStore;
    return store;
  };
  reload();
  return {
    get store(){return store;},get load(){return load;},get payload(){return payload;},reload,
    async generate(){
      const submitted=store.getState().document;
      const result=await load('lib/api.ts').solveSchedule(submitted);
      store.getState().applyGeneratedSchedule(submitted,result);
      assert.ok(!result.conflicts.some(c=>['invalidShift','solverInvalid','solverTimeout','solverInfeasible'].includes(c.code)),JSON.stringify(result.conflicts));
      return result;
    },
  };
}
test('editing flow: authorize, save, generate, revoke, save, reload and generate with real solver',async()=>{
  await withServer({},async({url})=>{
    const {document,covered,employeeId}=editingFixture(),client=editingClient(url);
    client.store.getState().setDocument(document);
    const person=()=>client.store.getState().document.employees.find(e=>e.id===employeeId);
    client.store.getState().upsertEmployee({...person(),coverageRoleIds:[covered.id]});
    client.reload();
    assert.deepEqual(Array.from(person().coverageRoleIds),[covered.id]);
    const authorized=await client.generate();
    assert.equal(authorized.gaps.length,0);
    assert.ok(authorized.assignments.length);
    client.store.getState().upsertEmployee({...person(),coverageRoleIds:[]});
    assert.deepEqual(Array.from(person().coverageRoles),[]);
    client.reload();
    const native=client.load('lib/nativeDocument.ts');
    client.store.getState().setDocument(native.parseNativeText(native.serializeNative(client.store.getState().document)));
    const revoked=await client.generate();
    const sent=client.payload.document.employees.find(e=>e.id===employeeId);
    assert.deepEqual(sent.coverageRoleIds,[]);assert.deepEqual(sent.coverageRoles,[]);
    assert.ok(revoked.gaps.some(g=>g.role===covered.name&&g.start==='2026-10-14T12:00:00'),JSON.stringify(revoked.gaps));
    assert.ok(client.store.getState().analysis.gaps.some(g=>g.role===covered.name));
    const local=client.load('lib/analysis.ts').analyzeDocument(client.store.getState().document);
    assert.ok(local.gaps.some(g=>g.role===covered.name&&g.start==='2026-10-14T12:00:00'));
  });
});
test('editing flow: generate, change employee role, save, reload and regenerate consistently',async()=>{
  await withServer({},async({url})=>{
    const {document,covered,employeeId}=editingFixture(),client=editingClient(url);
    client.store.getState().setDocument(document);
    const original=client.store.getState().document.employees.find(e=>e.id===employeeId);
    client.store.getState().upsertEmployee({...original,coverageRoleIds:[covered.id]});
    await client.generate();
    const employee=client.store.getState().document.employees.find(e=>e.id===employeeId);
    assert.ok(client.store.getState().document.assignments.some(a=>a.employeeId===employeeId));
    client.store.getState().upsertEmployee({...employee,role:covered.name,roleId:covered.id});
    client.reload();
    const check=()=>{
      for(const a of client.store.getState().document.assignments.filter(a=>a.employeeId===employeeId)){
        assert.equal(a.roleId,covered.id);assert.equal(a.role,covered.name);
      }
      assert.ok(!client.store.getState().analysis.conflicts.some(c=>c.code==='invalidShift'));
    };
    check();await client.generate();check();
    assert.equal(client.payload.document.employees.find(e=>e.id===employeeId).roleId,covered.id);
  });
});
test('editing flow: long duration input, save, persisted reload and generation preserve all hour digits',async()=>{
  await withServer({},async({url})=>{
    const {document}=editingFixture(),client=editingClient(url);
    client.store.getState().setDocument(document);
    for(const hours of ['36','168']){
      let duration;
      const {DurationInput}=client.load('components/DurationInput.tsx');
      DurationInput({value:client.store.getState().document.company.minimumRest,onChange:value=>{duration=value;}})
        .props.onChange({currentTarget:{value:hours+':00'}});
      const current=client.store.getState().document;
      const next=client.load('lib/documentSchema.ts').documentSchema.parse({...current,company:{...current.company,minimumRest:duration}});
      client.store.getState().setDocument(next);client.reload();
      assert.equal(client.store.getState().document.company.minimumRest,hours+':00:00');
      await client.generate();
      assert.equal(client.payload.document.company.minimumRest,hours+':00:00');
      assert.equal(client.store.getState().document.company.minimumRest,hours+':00:00');
    }
  });
});

// D1 correction: fixed overlapping assignments retain diagnostics but cannot provide two people.
test('overlapping preserved history counts people in team and directional role coverage', async () => {
  const load=require('../frontend/tests/source-loader.cjs')();
  const {analyzeDocument}=load('lib/analysis.ts');
  await withServer({},async ({post})=>{
    for(const s of require('../shared/solver-regression-scenarios.json').scenarios) {
      const before=JSON.stringify(s.request);
      const response=await post('/solve',s.request);assert.equal(response.status,200);
      const envelope=await response.json();assert.equal(envelope.success,true);
      const result=envelope.data;assert.ok(['optimal','feasible'].includes(result.optimization.status));
      assert.equal(result.coverageScore,1);assert.equal(result.gaps.length,0);
      for(const original of s.request.document.assignments)assert.deepEqual(result.assignments.find(a=>a.id===original.id),original);
      const local=analyzeDocument({...s.request.document,assignments:result.assignments});
      assert.equal(local.coverageScore,result.coverageScore);
      assert.deepEqual(JSON.parse(JSON.stringify(local.coverage)),result.coverage);
      const issueFields=issues=>issues.map(({code,severity,employeeId,start,end,role})=>({code,severity,employeeId,start,end,role}));
      assert.deepEqual(JSON.parse(JSON.stringify(issueFields(local.conflicts))),issueFields(result.conflicts));
      assert.deepEqual(JSON.parse(JSON.stringify(local.gaps)),result.gaps);
      assert.equal(JSON.stringify(s.request),before);
    }
  });
});
