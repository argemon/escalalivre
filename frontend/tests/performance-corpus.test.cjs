const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {scenarios}=require('../../shared/performance-scenarios.cjs');
test('synthetic performance corpus is reproducible and stays within structural dimensions',()=>{
 const first=scenarios(),second=scenarios();assert.equal(crypto.createHash('sha256').update(JSON.stringify(first)).digest('hex'),crypto.createHash('sha256').update(JSON.stringify(second)).digest('hex'));
 assert.equal(first.length,8);for(const c of first){const d=c.request.document;assert.ok(d.employees.length<=200);assert.ok(d.assignments.length<=20000);assert.ok(d.company.coverage.length<=1000);assert.ok(c.days<=31);assert.equal(new Set(d.assignments.map(a=>a.id)).size,d.assignments.length);assert.ok(d.employees.every(e=>e.name.startsWith('Pessoa sintetica ')));}
 assert.equal(first.find(c=>c.id==='history-limit').request.document.assignments.length,20000);
 assert.ok(Buffer.byteLength(JSON.stringify(first.find(c=>c.id==='history-limit').request))>2*1024*1024);
});
