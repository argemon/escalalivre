const {test}=require('node:test'),assert=require('node:assert/strict');
const load=require('./source-loader.cjs')();
const {civilMillis,civilString}=load('lib/civilTime.ts');
const {hasWorkAroundPause,intervalIssue}=load('lib/policies/interval.ts');
for(const s of require('../../shared/interval-timing-scenarios.json').scenarios)test('generation lunch margin: '+s.id,()=>{
  const start=civilMillis(s.start),pauseStart=start+s.beforeSeconds*1000,pauseEnd=pauseStart+s.pauseSeconds*1000;
  const a={id:'shift',employeeId:'person',role:'A',source:'manual',tags:[],start:s.start,
    end:civilString(pauseEnd+s.afterSeconds*1000),break:s.pauseSeconds?{start:civilString(pauseStart),end:civilString(pauseEnd)}:undefined};
  assert.equal(hasWorkAroundPause(a),s.allowed);
  assert.equal(intervalIssue(a),undefined);
});
