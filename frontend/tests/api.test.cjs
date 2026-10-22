const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function api(fetch) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/api.ts'), 'utf8')
    .replaceAll('import.meta.env', 'testEnv');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, testEnv: { DEV: false }, fetch, AbortSignal, DOMException,TextEncoder,
    require: name => name === './analysis' ? { planningPeriod: () => ({ start: '', end: '' }) } : name === './dateTime' ? { normalizeDocumentTimes: d => d, normalizeResultTimes: r => r } : {} });
  return exports;
}

for (const status of [429, 503]) {
  test(`HTTP ${status} explains the wait even with a non-JSON proxy response`, async () => {
    const service = api(async () => new Response('proxy overload', { status, headers: { 'Retry-After': '12' } }));
    await assert.rejects(service.solveSchedule({}), /Aguarde 12 segundos/);
  });
}
test('timeout and oversized planning have actionable messages', async () => {
  await assert.rejects(api(async () => new Response('', { status: 504 })).solveSchedule({}), /Reduza o período/);
  await assert.rejects(api(async () => new Response('', { status: 413 })).solveSchedule({}), /2 MB/);
});
test('non-JSON server failures do not leak a parser error to the user', async () => {
  await assert.rejects(api(async () => new Response('<html>Unavailable</html>', { status: 502 })).solveSchedule({}), /temporariamente indisponível/);
});
test('production uses the same origin by default and successful results still return', async () => {
  let requested;
  const service = api(async url => { requested = url; return Response.json({ success: true, data: { assignments: [] } }); });
  assert.deepEqual(JSON.parse(JSON.stringify(await service.solveSchedule({}))), { assignments: [] });
  assert.equal(requested, '/solve');
});

test('UTF-8 request boundary is checked before fetch, including the complete JSON envelope', async () => {
  const limit=2*1024*1024;
  for(const size of [limit-1,limit,limit+1]) {
    const overhead=Buffer.byteLength(JSON.stringify({document:{pad:''},start:'',end:''}),'utf8');
    const remaining=size-overhead;
    const document={pad:'é'.repeat(Math.floor(remaining/2))+'x'.repeat(remaining%2)};
    let calls=0;
    const service=api(async(_url,options)=>{
      calls++;assert.equal(Buffer.byteLength(options.body,'utf8'),size);
      return Response.json({success:true,data:{assignments:[]}});
    });
    if(size>limit){await assert.rejects(service.solveSchedule(document),/limite de 2 MB/);assert.equal(calls,0);}
    else {await service.solveSchedule(document);assert.equal(calls,1);}
  }
});

test('connection errors below the request limit remain connection errors',async()=>{
  await assert.rejects(api(async()=>{throw new TypeError('fetch failed');}).solveSchedule({}),/Não foi possível conectar/);
});
