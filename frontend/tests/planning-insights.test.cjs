const {test}=require('node:test'),assert=require('node:assert/strict');
const sourceLoader=require('./source-loader.cjs');
const fixtures=require('../../shared/hiring-demand-scenarios.json');
const load=sourceLoader(),{buildHiringSuggestions}=load('lib/hiringDemand.ts');
const plain=value=>JSON.parse(JSON.stringify(value));
for(const scenario of fixtures.scenarios)test('shared hiring demand: '+scenario.id,()=>{
  const actual=buildHiringSuggestions(scenario.gaps,scenario.referenceWeeklyHours);
  assert.deepEqual(plain(actual.map(({role,totalHours,weeklyHours,minimumPeople,peakMissingEmployees,weeklyDemand})=>({role,totalHours,weeklyHours,minimumPeople,peakMissingEmployees,weeklyDemand}))),scenario.expected);
  for(const suggestion of actual){assert.equal(suggestion.referenceWeeklyHours,scenario.referenceWeeklyHours);assert.equal(suggestion.idealWindows.length,scenario.gaps.filter(g=>g.role===suggestion.role).length);}
});
test('local analysis calculates a full 31-day hiring demand without truncating to 44 hours',()=>{
  const {analyzeDocument}=load('lib/analysis.ts');
  const result=analyzeDocument(structuredClone(fixtures.document)),suggestion=result.hiringSuggestions[0];
  assert.equal(suggestion.totalHours,496);assert.equal(suggestion.weeklyHours,112);assert.equal(suggestion.minimumPeople,3);
  assert.equal(result.optimization.status,'not-run');
});
function generation(overrides={}){return {assignments:[],conflicts:[],coverage:[],gaps:[],decisions:[],optimizationSuggestions:[],hiringSuggestions:[],coverageScore:1,...overrides};}
for(const status of ['feasible','optimal',undefined])test('generation only claims an optimum when the response proves it: '+status,()=>{
  const local=sourceLoader(),{useScheduleStore:store}=local('store/scheduleStore.ts');
  store.getState().setDocument(structuredClone(fixtures.document));const submitted=store.getState().document;
  store.getState().applyGeneratedSchedule(submitted,generation({optimization:status?{status}:undefined,gaps:fixtures.scenarios[2].gaps}));
  assert.equal(store.getState().solverStatus,status==='optimal'?'optimal':'feasible');
  assert.equal(store.getState().analysis.hiringSuggestions[0].totalHours,496);
  // Editing changes the model; an earlier proof must not label the modified planning.
  store.getState().setPlanningPeriod({start:'2026-10-02',end:'2026-10-31'});
  assert.equal(store.getState().solverStatus,'idle');assert.equal(store.getState().analysis.optimization.status,'not-run');
});
for(const status of ['timeout','infeasible','invalid'])test('unsuccessful optimizer metadata never replaces the document: '+status,()=>{
  const local=sourceLoader(),{useScheduleStore:store}=local('store/scheduleStore.ts');const original=store.getState().document;
  store.getState().applyGeneratedSchedule(original,generation({optimization:{status}}));
  assert.equal(store.getState().document,original);assert.equal(store.getState().solverStatus,'invalid');
});
test('a stale optimal response cannot mark a changed planning as optimal',()=>{
  const local=sourceLoader(),{useScheduleStore:store}=local('store/scheduleStore.ts'),submitted=store.getState().document;
  store.getState().setDocument(structuredClone(fixtures.document));const current=store.getState().document;
  store.getState().applyGeneratedSchedule(submitted,generation({optimization:{status:'optimal'}}));
  assert.equal(store.getState().document,current);assert.equal(store.getState().solverStatus,'idle');
});
