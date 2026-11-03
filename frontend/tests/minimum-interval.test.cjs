const {test}=require('node:test'),assert=require('node:assert/strict');
const load=require('./source-loader.cjs')();
const {intervalExtensionMillis}=load('lib/policies/interval.ts');
const {previewPause,intervalFor}=load('lib/intervals.ts');
for(const s of require('../../shared/minimum-interval-scenarios.json').scenarios)test('minimum interval preference: '+s.id,()=>{
  const company={opensAt:'07:30:00',closesAt:'17:30:00',lunch:{minimum:s.minimum,maximum:s.maximum,preferredAfter:'04:00:00'},middayClosure:s.middayClosure};
  const employee={fixedInterval:s.fixedInterval,worksDuringLunchClosure:s.worksDuringLunchClosure};
  const a={start:s.start,end:s.end,break:s.pauseStart?{start:s.pauseStart,end:s.pauseEnd}:undefined};
  assert.equal(intervalExtensionMillis(company,employee,a),s.expectedSeconds*1000);
});
const company={name:'Loja',opensAt:'07:30:00',closesAt:'17:30:00',operatingDays:[3],lunch:{minimum:'01:00:00',maximum:'02:00:00',preferredAfter:'04:00:00'},minimumRest:'11:00:00',coverage:[],defaultWorkload:{regimeType:'dayBased',workUnits:5,restUnits:2,weeklyLimitHours:44,defaultShiftDuration:'08:00:00'}};
const employee={id:'person',name:'A',role:'Staff',inheritsCompanyDefaults:true,workload:company.defaultWorkload,availability:[],restrictions:[],preferences:[],preferredDaysOff:[],allowsOvertime:false,allowsNightWork:false};
const start=new Date(2026,10,4,7,30).getTime(),end=new Date(2026,10,4,17,30).getTime();
test('preview chooses minimum instead of filling all available span',()=>{
  assert.equal(previewPause(company,employee,480,start,end),60);
  assert.equal(previewPause({...company,lunch:{...company.lunch,minimum:'01:30:00'}},employee,480,start,end),90);
});
test('preview honors an explicit longer interval and company closure',()=>{
  assert.equal(previewPause(company,{...employee,fixedInterval:{start:'11:30:00',end:'13:00:00'}},480,start,end),90);
  assert.equal(previewPause({...company,middayClosure:{start:'12:00:00',end:'14:00:00'}},employee,480,start,end),120);
});
test('manual requested duration remains available',()=>{
  const pause=intervalFor(company,employee,start,end,120);
  assert.ok(pause);
  assert.equal(new Date(pause.end)-new Date(pause.start),7200000);
});
