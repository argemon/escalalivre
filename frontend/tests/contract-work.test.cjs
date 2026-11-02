const {test}=require('node:test'),assert=require('node:assert/strict');
const load=require('./source-loader.cjs')();
const {analyzeDocument}=load('lib/analysis.ts');
for(const s of require('../../shared/contract-work-scenarios.json').scenarios)test('contract work: '+s.id,()=>{
 const before=JSON.stringify(s.request.document),result=analyzeDocument(s.request.document),w=result.workloads[0],e=s.expected;
 assert.equal(w.expectedSeconds,e.expected);assert.equal(w.plannedSeconds,e.planned);assert.equal(w.unmetSeconds,e.unmet);assert.equal(w.excusedSeconds,e.excused);assert.equal(w.historicalWorkSeconds,e.history??0);
 assert.deepEqual([...new Set(result.conflicts.filter(c=>c.severity==='error').map(c=>c.code))].sort(),e.errors.slice().sort());
 assert.equal(result.conflicts.some(c=>c.code==='workloadShortfall'),e.unmet>0);
 assert.equal(JSON.stringify(s.request.document),before);
});

test('explicit contractual leave survives native save without changing shifts and rejects invalid credits',()=>{
 const {sampleDocument}=load('data/sample.ts'),{documentSchema}=load('lib/documentSchema.ts'),{serializeNative,parseNativeText}=load('lib/nativeDocument.ts');
 const doc=documentSchema.parse(structuredClone(sampleDocument)),before=JSON.stringify(doc.assignments);
 doc.employees[0].contractLeaves=[{date:'2026-11-09',excusedSeconds:3601}];
 const saved=parseNativeText(serializeNative(doc));assert.equal(saved.employees[0].contractLeaves[0].excusedSeconds,3601);assert.equal(JSON.stringify(saved.assignments),before);
 saved.employees[0].contractLeaves=null;assert.equal(documentSchema.safeParse(saved).success,true);
 for(const seconds of [-1,0,86401,0.5]){saved.employees[0].contractLeaves=[{date:'2026-11-09',excusedSeconds:seconds}];assert.equal(documentSchema.safeParse(saved).success,false);}
});
