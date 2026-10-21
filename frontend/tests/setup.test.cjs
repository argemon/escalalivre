const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.join(__dirname, '..') + '/';
const ts = require(root + 'node_modules/typescript');
function load(relative) {
  const exports = {};
  const source = fs.readFileSync(root+'src/'+relative, 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, Date, Set, Map, require: r => load(path.posix.normalize(path.posix.join(path.posix.dirname(relative), r))+'.ts') });
  return exports;
}
const { sampleDocument } = load('data/sample.ts');
const { analyzeDocument } = load('lib/analysis.ts');
const { assignmentLabel } = load('lib/planning.ts');
const { weeklyCoverage } = load('lib/weeklyCoverage.ts');
test('shift labels preserve 07:30 rather than rounding to 07h', () => {
  assert.equal(assignmentLabel({start:'2026-10-14T07:30:00',end:'2026-10-14T17:30:00'}),'07:30–17:30');
});
test('lunch closure has no normal coverage demand', () => {
  const doc = structuredClone(sampleDocument);
  doc.company.opensAt='07:30:00';doc.company.closesAt='17:30:00';
  doc.company.middayClosure={start:'12:00:00',end:'13:00:00'};
  doc.company.coverage=[{role:'vendedor',day:1,start:'07:30:00',end:'17:30:00',minimumEmployees:1}];
  const result=analyzeDocument(doc);
  assert.ok(result.coverage.length);
  assert.ok(result.coverage.every(b => b.end.slice(11,16)<='12:00' || b.start.slice(11,16)>='13:00'));
  doc.company.coverage[0].allowsOutsideHours=true;
  assert.ok(analyzeDocument(doc).coverage.some(b => b.start.slice(11,16)>='12:00' && b.start.slice(11,16)<'13:00'));
});
test('predicted weekly coverage excludes the lunch closure', () => {
  const doc = structuredClone(sampleDocument);doc.assignments=[];doc.employees.forEach(e=>e.inheritsCompanyDefaults=true);
  doc.company.opensAt='07:30:00';doc.company.closesAt='17:30:00';
  doc.company.middayClosure={start:'12:00:00',end:'13:00:00'};
  doc.company.coverage=[{role:'vendedor',day:1,start:'07:30:00',end:'17:30:00',minimumEmployees:1}];
  const shifts=weeklyCoverage(doc,'2026-05-18');
  assert.ok(shifts.length);
  assert.ok(shifts.every(a => a.break?.start.slice(11,16)<='12:00' && a.break?.end.slice(11,16)>='13:00'));
  assert.ok(shifts.every(a => a.end.slice(11,16)==='17:30'));
});

const { holidayOn } = load('lib/holidays.ts');
const { requiredInterval, intervalProblem } = load('lib/intervals.ts');
test('CLT interval thresholds use worked hours',()=>{
 for(const [work,expected] of [[240,0],[241,15],[360,15],[361,60]]) assert.equal(requiredInterval(work),expected);
 const a={start:'2026-10-14T07:30:00',end:'2026-10-14T15:30:00'};
 assert.match(intervalProblem(a),/60/);
});
test('national and local holidays exclude previews unless open',()=>{
 const doc=structuredClone(sampleDocument);doc.planningPeriod={start:"2026-10-12",end:"2026-10-18"};doc.assignments=[];doc.employees.forEach(e=>e.inheritsCompanyDefaults=true);
 assert.equal(holidayOn(doc.company,'2026-10-12').name,'Nossa Senhora Aparecida');
 assert.equal(weeklyCoverage(doc,'2026-10-12').length,0);
 doc.company.holidays=[{date:'2026-10-12',name:'Nossa Senhora Aparecida',closed:false},{date:'2026-10-14',name:'Aniversário municipal',closed:true}];
 assert.ok(weeklyCoverage(doc,'2026-10-12').length);
 assert.equal(weeklyCoverage(doc,'2026-10-14').length,0);
});
test('every preview has a valid interval even without company closure',()=>{
 const doc=structuredClone(sampleDocument);doc.planningPeriod={start:"2026-10-12",end:"2026-10-18"};doc.assignments=[];doc.employees.forEach(e=>e.inheritsCompanyDefaults=true);
 doc.company.opensAt='07:30:00';doc.company.closesAt='17:30:00';doc.company.coverage=[];
 for(const hours of [4,5,6,8]) {
  doc.company.defaultWorkload.defaultShiftDuration=String(hours).padStart(2,'0')+':00:00';
  const shifts=weeklyCoverage(doc,'2026-10-14');assert.ok(shifts.length);
  for(const a of shifts) {
   assert.equal(intervalProblem(a),undefined);
   const pause=a.break ? Date.parse(a.break.end)-Date.parse(a.break.start) : 0;
   assert.equal((Date.parse(a.end)-Date.parse(a.start)-pause)/3600000,hours);
  }
 }
});

test('preview evaluates the maximum interval to cover the end of the day',()=>{
 const doc=structuredClone(sampleDocument);doc.planningPeriod={start:"2026-10-12",end:"2026-10-18"};doc.assignments=[];doc.employees.forEach(e=>e.inheritsCompanyDefaults=true);
 doc.company.opensAt='07:30:00';doc.company.closesAt='17:30:00';doc.company.coverage=[];
 doc.company.lunch={minimum:'01:00:00',maximum:'02:00:00',preferredAfter:'04:00:00'};
 for(const a of weeklyCoverage(doc,'2026-10-14')) {assert.equal(a.end.slice(11,16),'17:30');assert.equal((Date.parse(a.break.end)-Date.parse(a.break.start))/3600000,2);}
 doc.employees[0].fixedInterval={start:'12:00:00',end:'13:30:00'};
 const fixed=weeklyCoverage(doc,'2026-10-14').find(a=>a.employeeId===doc.employees[0].id);
 assert.equal(fixed.break.start.slice(11,16),'12:00');assert.equal(fixed.break.end.slice(11,16),'13:30');assert.equal(fixed.end.slice(11,16),'17:00');
});

const { coverageAllocation }=load('lib/coverageAllocation.ts');
test('directional substitution covers attendant but never replaces pharmacist in reverse',()=>{
 const doc=structuredClone(sampleDocument);doc.planningPeriod={start:"2026-10-12",end:"2026-10-18"};const pharmacy=doc.employees[0],attendant=doc.employees[1];doc.employees=[pharmacy,attendant];
 pharmacy.role='Farmacêutico';pharmacy.coverageRoles=['Atendente'];attendant.role='Atendente';
 doc.assignments=[{...doc.assignments[0],employeeId:pharmacy.id,role:pharmacy.role,start:'2026-10-14T07:30:00',end:'2026-10-14T16:30:00',break:{start:'2026-10-14T11:00:00',end:'2026-10-14T12:00:00'}},{...doc.assignments[0],id:'other',employeeId:attendant.id,role:attendant.role,start:'2026-10-14T07:30:00',end:'2026-10-14T16:30:00',break:{start:'2026-10-14T12:00:00',end:'2026-10-14T13:00:00'}}];
 const rules=[{role:'Farmacêutico',minimumEmployees:1},{role:'Atendente',minimumEmployees:1}];
 const first=coverageAllocation(doc,Date.parse('2026-10-14T11:00:00'),Date.parse('2026-10-14T12:00:00'),rules);
 assert.equal(first.find(b=>b.rule.role==='Farmacêutico').assigned,0);
 const second=coverageAllocation(doc,Date.parse('2026-10-14T12:00:00'),Date.parse('2026-10-14T13:00:00'),rules);
 assert.equal(second.reduce((n,b)=>n+b.assigned,0),1);
 const onlyAttendant=coverageAllocation(doc,Date.parse('2026-10-14T12:00:00'),Date.parse('2026-10-14T13:00:00'),[rules[1]]);assert.equal(onlyAttendant[0].assigned,1);
});

test('authorized holiday shift keeps company closed and preserves other safeguards',()=>{
 const doc=structuredClone(sampleDocument);doc.planningPeriod={start:"2026-10-12",end:"2026-10-18"};const person=doc.employees[0];
 doc.company.holidays=[{date:'2026-10-12',name:'Feriado',closed:true}];doc.company.operatingDays=[];
 doc.assignments=[{id:'holiday-shift',employeeId:person.id,role:person.role,start:'2026-10-12T08:00:00',end:'2026-10-12T12:00:00',source:'manual',tags:['holiday:2026-10-12']}];
 person.inheritsCompanyDefaults=true;person.restrictions=[{start:'2026-10-12T08:00:00',end:'2026-10-12T12:00:00'}];
 const result=analyzeDocument(doc);
 assert.ok(!result.conflicts.some(c=>['holiday','outsideHours','workingDay'].includes(c.code)&&c.severity==='error'));
 assert.ok(result.conflicts.some(c=>c.code==='availability'));
 assert.ok(!result.coverage.some(b=>b.start.slice(0,10)==='2026-10-12'));
 assert.deepEqual(weeklyCoverage(doc,'2026-10-12').map(a=>a.id),['holiday-shift']);
 doc.assignments[0].tags=[];assert.ok(analyzeDocument(doc).conflicts.some(c=>c.code==='holiday'));
 doc.assignments[0].tags=['holiday:2026-10-13'];assert.ok(analyzeDocument(doc).conflicts.some(c=>c.code==='holiday'));
});
