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
  vm.runInNewContext(code, { exports, testEnv: { DEV: false }, fetch, AbortSignal, DOMException,
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
