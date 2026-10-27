// Synthetic, fixed identities and civil dates; no personal data or runtime randomness.
const id=n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0');
const day=n=>new Date(Date.UTC(2026,9,12+n)).toISOString().slice(0,10);
function make(name,people,days,{pause='fixed',history=0,coverage=7,filled=false}={}) {
 const request=structuredClone(require('./rule-scenarios.json').scenarios[0].request),d=request.document;
 request.start=day(0)+'T00:00:00';request.end=day(days-1)+'T23:59:59';d.planningPeriod={start:day(0),end:day(days-1)};
 d.id=id(1);d.updatedAt='2026-10-01T00:00:00.000Z';d.roles=[0,1,2].map(i=>({id:id(10+i),name:'Funcao '+i}));
 const work={regimeType:'dayBased',workUnits:7,restUnits:0,weeklyLimitHours:44,defaultShiftDuration:pause==='none'?'04:00:00':'08:00:00'};
 Object.assign(d.company,{name:'Empresa sintetica',opensAt:'08:00:00',closesAt:pause==='none'?'12:00:00':'18:00:00',defaultWorkload:work,lunch:{minimum:pause==='none'?'00:00:00':'01:00:00',maximum:pause==='none'?'00:00:00':'02:00:00',preferredAfter:'04:00:00'}});
 d.company.coverage=Array.from({length:coverage},(_,i)=>({role:'Funcao '+(Math.floor(i/7)%3),roleId:id(10+Math.floor(i/7)%3),scope:coverage===7?'team':'role',day:i%7,start:'08:00:00',end:pause==='none'?'12:00:00':'18:00:00',minimumEmployees:Math.max(1,Math.floor(people/(coverage===7?2:6)))}));
 const base=d.employees[0];d.employees=Array.from({length:people},(_,i)=>({...structuredClone(base),id:id(100+i),name:'Pessoa sintetica '+i,role:'Funcao '+i%3,roleId:id(10+i%3),workload:work,coverageRoleIds:i%3===0?[id(11)]:[],coverageRoles:i%3===0?['Funcao 1']:[],availability:[],restrictions:[],preferences:[{code:'opening',description:'Preferencia sintetica',weight:1}],...(pause==='variable'?{}:{shiftStartsAt:'08:00:00'}),...(pause==='fixed'?{fixedInterval:{start:i%2?'13:00:00':'12:00:00',end:i%2?'14:00:00':'13:00:00'}}:{})}));
 d.assignments=[];
 for(let e=0;e<people;e++)for(const offset of [...(filled?Array.from({length:days},(_,i)=>i):[]),...Array.from({length:history},(_,i)=>i<history/2?-1-i:days+i-Math.floor(history/2))]){
  const person=d.employees[e],start=day(offset)+'T08:00:00',end=day(offset)+(pause==='none'?'T12:00:00':'T17:00:00');
  d.assignments.push({id:id(1000+d.assignments.length),employeeId:person.id,role:person.role,roleId:person.roleId,start,end,break:pause==='none'?null:{start:day(offset)+(e%2?'T13:00:00':'T12:00:00'),end:day(offset)+(e%2?'T14:00:00':'T13:00:00')},source:'manual',tags:['synthetic-history']});
 }
 return {id:name,people,days,pause,coverageRequirements:coverage,historyPerPerson:history,assignmentCount:d.assignments.length,operations:['analyze','solve'],request};
}
function scenarios(){
 const cases=[make('small-fixed',4,7,{filled:true}),make('fortnight-history',12,14,{history:4,coverage:21}),make('variable-breaks',4,3,{pause:'variable',coverage:21}),make('max-people-period',200,31,{pause:'none'}),make('candidate-limit',200,31,{pause:'variable'}),make('near-candidate-limit',80,3,{pause:'variable',coverage:21}),make('coverage-limit',40,31,{coverage:1000,filled:true}),make('history-limit',200,31,{pause:'none',history:100})];
 for(const c of cases)if(['coverage-limit','history-limit'].includes(c.id))c.operations=['analyze'];
 for(const c of cases)if(['candidate-limit','near-candidate-limit'].includes(c.id))c.expectedComplexity=true;
 return cases;
}
module.exports={scenarios};
