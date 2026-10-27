const baseline=require('./rule-scenarios.json').scenarios;
const clone=value=>JSON.parse(JSON.stringify(value));
const id=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const boundaries=()=>clone(require('./parity-boundaries.json').scenarios);
const SEEDS=[0x1a2b3c4d,0x5eed1234,0xc0ffee];
function generated(seed,count=24) {
  if(!Number.isInteger(seed)||seed<0||seed>0xffffffff||!Number.isInteger(count)||count<1||count>32)throw new Error('Bounded unsigned seed and count 1..32 required');
  let state=seed>>>0;const next=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
  return Array.from({length:count},(_,index)=>{
    const scenario=clone(boundaries()[next()%boundaries().length]);scenario.id='seed-'+seed+'-'+index;delete scenario.expectedScore;delete scenario.expectedGap;delete scenario.requiredCodes;delete scenario.forbiddenCodes;
    const d=scenario.request.document;
    // Finite boundary vocabulary: exact seconds, both history sides, threshold limits and contention.
    const second=1+next()%3;for(const a of d.assignments){a.end=a.end.slice(0,-2)+String(second).padStart(2,'0');}
    d.company.minimumRest=['11:00:00','11:00:01','12:00:00','24:00:00'][next()%4];
    d.company.defaultWorkload.weeklyLimitHours=[8,10,44][next()%3];
    d.company.defaultWorkload.regimeType=next()%2?'hourBased':'dayBased';
    d.company.defaultWorkload.workUnits=d.company.defaultWorkload.regimeType==='hourBased'?4:2;
    d.company.defaultWorkload.restUnits=d.company.defaultWorkload.regimeType==='hourBased'?11:1;
    d.company.coverage[0].minimumEmployees=1+next()%3;
    if(next()%2)d.employees.push({...clone(d.employees[0]),id:id(100+index),role:'Suporte',roleId:id(11),coverageRoleIds:[],coverageRoles:[]});
    if(d.employees.length>1)d.assignments.push({...clone(d.assignments[0]),id:id(200+index),employeeId:d.employees[1].id,role:'Suporte',roleId:id(11)});
    // Preferences must remain preferences, including negative weights.
    d.employees[0].preferredDaysOff=[1];d.employees[0].preferences=[{code:'opening',description:'deterministic preference',weight:next()%2?1:-1}];
    return scenario;
  });
}
function corpus(){return [...baseline.filter(s=>s.apiValid),...boundaries(),...SEEDS.flatMap(seed=>generated(seed))];}
module.exports={boundaries,generated,corpus,SEEDS};
