const {test}=require('node:test'),assert=require('node:assert/strict');
const load=require('./source-loader.cjs')(),{contractMinimums}=load('lib/policies/contractMinimum.ts');
const {generationProposal}=load('lib/generationProposal.ts'),{analyzeDocument}=load('lib/analysis.ts');
const scenarios=require('../../shared/contract-work-scenarios.json').scenarios;
for(const s of scenarios)test('contract generation minimum: '+s.id,()=>{
 const before=JSON.stringify(s.request.document),minimums=contractMinimums(s.request.document,s.request.start,s.request.end);
 assert.equal(minimums.reduce((n,m)=>n+m.requiredSeconds,0),s.expected.minimumRequired);
 assert.equal(minimums.reduce((n,m)=>n+m.missingSeconds,0),s.expected.minimumMissing);
 assert.equal(JSON.stringify(s.request.document),before);
});
test('a successful-looking result cannot apply incomplete contracted hours',()=>{
 const s=structuredClone(scenarios.find(s=>s.id==='forty-not-ceiling'));
 s.request.document.assignments=[];const d=s.request.document;
 const result={...analyzeDocument(d),optimization:{status:'feasible'}};
 assert.throws(()=>generationProposal(d,result),/carga contratada/);
 assert.deepEqual(d.assignments,[]);
});
test('explicit 42h with 8h remains applicable and reports its intentional 2h shortfall',()=>{
 const s=structuredClone(scenarios.find(s=>s.id==='five-day-42-fixed-eightHours')),d=s.request.document;
 const result={...analyzeDocument(d),optimization:{status:'optimal'}};
 const proposal=generationProposal(d,result);
 assert.equal(proposal.document.assignments.length,5);
 assert.equal(result.workloads[0].unmetSeconds,7200);
});
test('inactive contracts are excluded and a mismatched distribution cannot lower the minimum',()=>{
 const s=structuredClone(scenarios.find(s=>s.id==='forty-not-ceiling')),d=s.request.document;
 d.employees[0].inactiveFrom=d.planningPeriod.start;
 assert.deepEqual(JSON.parse(JSON.stringify(contractMinimums(d,s.request.start,s.request.end))),[]);
 delete d.employees[0].inactiveFrom;
 d.company.defaultWorkload.weeklyPlan.dailySeconds=[0,0,0,0,0,0,0];
 const result={...analyzeDocument(d),optimization:{status:'feasible'}};
 assert.throws(()=>generationProposal(d,result),/distribuição diária/);
});
test('completing 42h with authorized extras keeps the normal shortfall and extras separate',()=>{
 const s=structuredClone(scenarios.find(s=>s.id==='five-day-42-fixed-eightHours')),d=s.request.document;
 d.employees[0].allowsOvertime=true;
 for(const a of d.assignments)a.end=a.end.slice(0,11)+'16:54:00';
 const result=analyzeDocument(d),minimum=contractMinimums(d,s.request.start,s.request.end);
 assert.equal(result.workloads[0].plannedSeconds,151200);
 assert.equal(result.workloads[0].unmetSeconds,7200);
 assert.equal(result.workloads[0].excessSeconds,7200);
 assert.equal(minimum[0].requiredSeconds,144000);
 assert.equal(minimum[0].missingSeconds,0);
});
