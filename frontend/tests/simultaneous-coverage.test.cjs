const {test}=require('node:test'),assert=require('node:assert/strict');
const load=require('./source-loader.cjs')();
const {analyzeDocument}=load('lib/analysis.ts');
for(const scenario of require('../../shared/simultaneous-coverage-scenarios.json').scenarios) {
  test('simultaneous authorized coverage: '+scenario.id,()=>{
    const before=JSON.stringify(scenario.request.document);
    const result=analyzeDocument(scenario.request.document);
    assert.equal(result.coverageScore,scenario.expectedScore);
    assert.equal(result.gaps.length,scenario.expectedGaps);
    if(scenario.expectedAssigned)for(const block of result.coverage)assert.equal(block.assigned,scenario.expectedAssigned[block.role]);
    assert.equal(JSON.stringify(scenario.request.document),before);
  });
}
