const {test}=require('node:test'),assert=require('node:assert/strict');
const load=require('./source-loader.cjs')();
const {analyzeDocument}=load('lib/analysis.ts');
for(const s of require('../../shared/solver-regression-scenarios.json').scenarios)test('D1 person capacity: '+s.id,()=>{
 const before=JSON.stringify(s.request.document);
 const initial=analyzeDocument(s.request.document);
 assert.equal(initial.coverageScore,0.5);assert.ok(initial.gaps.length);
 const corrected=analyzeDocument({...s.request.document,assignments:[...s.request.document.assignments,s.addition]});
 assert.equal(corrected.coverageScore,1);assert.equal(corrected.gaps.length,0);
 assert.ok(corrected.conflicts.some(i=>i.code==='multipleShifts'));
 assert.equal(JSON.stringify(s.request.document),before);
});
