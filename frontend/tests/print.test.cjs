const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const exportsObject = {};
const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/lib/printSchedule.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function dependency(file) {
  const exports={};const code=ts.transpileModule(fs.readFileSync(path.join(root,'src/lib',file+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(code,{exports,Date,Intl,require:r=>dependency(r.replace('./',''))});return exports;
}
vm.runInNewContext(code, { exports: exportsObject, Date, require: r => dependency(r.replace('./','')) });
const { periodDays, printWeeks, displayTime, dayOffset, weekStart } = exportsObject;
const { monthBounds } = exportsObject;
const { employeePrintRows } = exportsObject;

test('employee list sorts names alphabetically and groups only consecutive equal schedules',()=>{
  const people=[{id:'e',name:'Edson',role:'Staff'},{id:'a',name:'Alex',role:'Monitor'}];
  const shifts=[14,15,17,18].map(day=>({id:String(day),employeeId:'e',role:'Staff',start:`2026-10-${day}T07:30:00`,end:`2026-10-${day}T17:30:00`,break:{start:`2026-10-${day}T11:30:00`,end:`2026-10-${day}T13:30:00`}}));
  shifts[3].break.end='2026-10-18T12:30:00';
  const rows=employeePrintRows({employees:people,assignments:shifts},'2026-10');
  assert.equal(rows[0].person.name,'Alex');
  assert.equal(rows[0].start,'');
  assert.equal(rows.length,4);
  assert.equal(rows[1].start,'2026-10-14');
  assert.equal(rows[1].end,'2026-10-15');
  assert.equal(rows[2].end,'2026-10-17');
  assert.equal(rows[3].interval,'11:30–12:30');
});

test('employee list preserves overnight times and excludes other months',()=>{
  const shifts=[30,31].map(day=>({id:String(day),employeeId:'e',role:'Segurança',start:`2026-10-${day}T22:00:00`,end:day===30?'2026-10-31T06:00:00':'2026-11-01T06:00:00',break:{start:day===30?'2026-10-31T02:00:00':'2026-11-01T02:00:00',end:day===30?'2026-10-31T03:00:00':'2026-11-01T03:00:00'}}));
  shifts.push({...shifts[0],id:'outside',start:'2026-11-01T22:00:00'});
  const rows=employeePrintRows({employees:[],assignments:shifts},'2026-10');
  assert.equal(rows.length,1);
  assert.equal(rows[0].end,'2026-10-31');
  assert.equal(rows[0].hours,'22:00–06:00 (+1d)');
  assert.equal(rows[0].interval,'02:00 (+1d)–03:00 (+1d)');
});

test('monthly sheet includes every day once, including leap February and six-row months', () => {
  for (const [month, count, rows] of [['2024-02',29,5],['2026-05',31,6],['2026-02',28,4]]) {
    const bounds = monthBounds(month);
    const weeks = printWeeks({employees:[],assignments:[]},bounds.start,bounds.end);
    const days = weeks.flatMap(w=>w.days).filter(d=>d.startsWith(month));
    assert.equal(days.length,count);
    assert.equal(new Set(days).size,count);
    assert.equal(weeks.length,rows);
  }
  assert.equal(monthBounds('2026-13'),undefined);
  assert.equal(monthBounds(''),undefined);
});

test('print period rejects invalid dates, reversed ranges and more than 366 days', () => {
  for (const [start, end] of [['', '2026-10-14'], ['2026-02-30', '2026-03-01'], ['2026-10-15', '2026-10-14'], ['2026-01-01', '2027-01-02']]) {
    assert.equal(periodDays(start, end).length, 0);
  }
  assert.equal(periodDays('2024-01-01', '2024-12-31').length, 366);
});

test('print pages run Sunday through Saturday across years', () => {
  const doc = { employees: [], assignments: [] };
  const weeks = printWeeks(doc, '2026-12-28', '2027-01-05');
  assert.equal(weeks.length, 2);
  assert.equal(weeks[0].days.length, 7);
  assert.equal(weeks[1].days.length, 7);
  assert.equal(weeks[0].days[0], '2026-12-27');
  assert.equal(weeks[1].days.at(-1), '2027-01-09');
  for (const week of weeks) {
    assert.equal(new Date(week.days[0]+'T12:00:00').getDay(), 0);
    assert.equal(new Date(week.days[6]+'T12:00:00').getDay(), 6);
  }
});

test('print uses saved shifts only, keeps overnight intervals and shows employees without shifts', () => {
  const shift = { id: 'night', employeeId: 'ana', role: 'Segurança', start: '2026-10-14T22:30:00', end: '2026-10-15T06:30:00', break: { start: '2026-10-15T02:00:00', end: '2026-10-15T03:00:00' } };
  const doc = { employees: [{ id: 'ana', name: 'Ana', role: 'Segurança' }, { id: 'bruno', name: 'Bruno', role: 'Atendente' }], assignments: [shift, { ...shift, id: 'outside', start: '2026-10-16T22:30:00' }] };
  const [week] = printWeeks(doc, '2026-10-14', '2026-10-15');
  assert.equal(week.rows.length, 2);
  assert.equal(week.rows[0].cells[3][0], shift);
  assert.equal(week.rows[0].cells[4].length, 0);
  assert.equal(week.rows[0].cells[5].length, 0);
  assert.equal(week.rows[1].cells.flat().length, 0);
  assert.equal(displayTime(shift.start), '22:30');
  assert.equal(dayOffset(shift.end, shift.start), ' (+1d)');
  assert.equal(dayOffset(shift.break.start, shift.start), ' (+1d)');
});

test('print does not silently omit shifts referencing an employee no longer registered', () => {
  const doc = { employees: [], assignments: [{ id: 'one', employeeId: 'removed', role: 'Caixa', start: '2026-10-14T09:00:00' }] };
  const [week] = printWeeks(doc, '2026-10-14', '2026-10-14');
  assert.equal(week.rows[0].person.name, 'Pessoa não cadastrada');
  assert.equal(week.rows[0].cells[3].length, 1);
});

test('a Wednesday to Tuesday period spans two calendar weeks without leaking outside shifts', () => {
  const doc = { employees: [{id:'ana', name:'Ana', role:'Staff'}], assignments: ['2026-10-11','2026-10-14','2026-10-20','2026-10-24'].map(day => ({id:day,employeeId:'ana',start:day+'T07:30:00'})) };
  const weeks = printWeeks(doc,'2026-10-14','2026-10-20');
  assert.equal(weeks.length, 2);
  assert.equal(weeks[0].days[0], '2026-10-11');
  assert.equal(weeks[1].days[6], '2026-10-24');
  assert.equal(weeks.flatMap(w=>w.rows[0].cells.flat()).length, 2);
  for (let day = 11; day <= 17; day++) {
    const sunday = weekStart(new Date(`2026-10-${day}T00:00:00`));
    assert.equal(sunday.getDay(), 0);
    assert.equal(sunday.getDate(), 11);
  }
});
