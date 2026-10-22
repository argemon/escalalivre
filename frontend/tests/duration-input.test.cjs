const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.join(__dirname,'../src');
function componentLoad(file) {
  const exports={};
  const source=fs.readFileSync(path.join(root,file),'utf8');
  const code=ts.transpileModule(source,{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code,{exports,requestAnimationFrame:fn=>fn(),document:{activeElement:null},require:r=>r.startsWith('.')?componentLoad(path.posix.normalize(path.posix.join(path.posix.dirname(file),r))+'.ts'):require(r)});
  return exports;
}
const {DurationInput}=componentLoad('components/DurationInput.tsx');
const {TimeInput}=componentLoad('components/TimeInput.tsx');
const {formatDuration}=componentLoad('lib/duration.ts');
const load=require('./source-loader.cjs')();
const {sampleDocument}=load('data/sample.ts');
const {serializeNative,parseNativeText}=load('lib/nativeDocument.ts');
const matches=(input,value)=>new RegExp('^(?:'+input.props.pattern+')$','v').test(value);
for(const hours of ['24','36','100','168'])test(`${hours} hours display completely, can be edited and survive native round trip`,()=>{
  let value=hours+':00:00';
  let input=DurationInput({value,onChange:next=>{value=next;}});
  assert.equal(input.props.value,hours+':00');
  assert.ok(matches(input,input.props.value));
  input.props.onChange({currentTarget:{value:hours+':00'}});
  assert.equal(value,hours+':00:00');
  const document=structuredClone(sampleDocument);document.company.minimumRest=value;
  const restored=parseNativeText(serializeNative(document));
  assert.equal(restored.company.minimumRest,value);
  input=DurationInput({value:restored.company.minimumRest,onChange:next=>{value=next;}});
  input.props.onChange({currentTarget:{value:'36:30'}});
  assert.equal(value,'36:30:00');
  const changed=parseNativeText(serializeNative({...restored,company:{...restored.company,minimumRest:value}}));
  assert.equal(changed.company.minimumRest,'36:30:00');
});
test('duration entry supports typing, clearing, short hours and precise seconds without truncation',()=>{
  let value='168:00:00';
  for(const typed of ['','1','16','168','168:','168:0','168:00']) {
    DurationInput({value,onChange:next=>{value=next;}}).props.onChange({currentTarget:{value:typed}});
    assert.equal(value,typed==='168:00'?'168:00:00':typed);
  }
  for(const [typed,expected] of [['1:30','01:30:00'],['36:12:34','36:12:34'],['00:00:01','00:00:01']]) {
    DurationInput({value,onChange:next=>{value=next;}}).props.onChange({currentTarget:{value:typed}});
    assert.equal(value,expected);
    assert.ok(matches(DurationInput({value,onChange:()=>{}}),formatDuration(value)));
  }
  assert.equal(formatDuration('168:12:34'),'168:12:34');
  assert.equal(formatDuration('168:00:00'),'168:00');
});
test('durations validate minutes and seconds while clock fields retain the 24-hour boundary',()=>{
  const duration=DurationInput({value:'36:00:00',onChange:()=>{}});
  for(const invalid of ['-1:00','36:60','36:00:60','1000:00','abc','36:'])assert.equal(matches(duration,invalid),false,invalid);
  const clock=TimeInput({value:'09:30:00',onChange:()=>{}});
  assert.equal(clock.props.value,'09:30');
  assert.ok(matches(clock,'09:30'));
  for(const invalid of ['24:00','36:00','168:00'])assert.equal(matches(clock,invalid),false,invalid);
});
test('field-specific duration limits still apply after accepting long hours',()=>{
  const document=structuredClone(sampleDocument);
  document.company.minimumRest='169:00:00';
  assert.throws(()=>serializeNative(document));
  document.company.minimumRest='36:00:00';
  document.company.defaultWorkload.defaultShiftDuration='24:00:00';
  document.company.lunch.preferredAfter='24:00:00';
  const restored=parseNativeText(serializeNative(document));
  assert.equal(restored.company.defaultWorkload.defaultShiftDuration,'24:00:00');
  assert.equal(restored.company.lunch.preferredAfter,'24:00:00');
  document.company.defaultWorkload.defaultShiftDuration='36:00:00';
  assert.throws(()=>serializeNative(document));
});
