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
const {hoursToDuration,durationToHours}=componentLoad('lib/duration.ts');
test('hour cycles display durations and retain numeric hours in the document',()=>{
 for(const hours of [0,2,5,24,36,168]) {
  const input=DurationInput({value:hoursToDuration(hours),onChange(){},pattern:'[0-9]{1,3}:00(?::00)?'});
  assert.equal(input.props.value,String(hours).padStart(2,'0')+':00');
  assert.ok(matches(input,input.props.value));
  assert.equal(durationToHours(hoursToDuration(hours)),hours);
  assert.ok(!matches(input,'05:30'));
 }
 assert.equal(durationToHours('05:30:00'),5.5);
 assert.equal(hoursToDuration(5.5),'05:30:00');
});
const load=require('./source-loader.cjs')();
const {sampleDocument}=load('data/sample.ts');
const {serializeNative,parseNativeText}=load('lib/nativeDocument.ts');
const matches=(input,value)=>new RegExp('^(?:'+input.props.pattern+')$','v').test(value);
for(const hours of ['24','36','100','168'])test(`${hours} hours display completely, can be edited and survive native round trip`,()=>{
  let value=hours+':00:00';
  let input=DurationInput({value,onChange:next=>{value=next;}});
  assert.equal(input.props.value,hours+':00');
  assert.ok(matches(input,input.props.value));
  input.props.onChange({currentTarget:{setSelectionRange(){},value:hours+':00'}});
  assert.equal(value,hours+':00:00');
  const document=structuredClone(sampleDocument);document.company.minimumRest=value;
  const restored=parseNativeText(serializeNative(document));
  assert.equal(restored.company.minimumRest,value);
  input=DurationInput({value:restored.company.minimumRest,onChange:next=>{value=next;}});
  input.props.onChange({currentTarget:{setSelectionRange(){},value:'36:30'}});
  assert.equal(value,'36:30:00');
  const changed=parseNativeText(serializeNative({...restored,company:{...restored.company,minimumRest:value}}));
  assert.equal(changed.company.minimumRest,'36:30:00');
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



function editor(Component,initial='') {
 let value=initial;
 const element={value:'',selectionStart:0,selectionEnd:0,setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;},select(){this.setSelectionRange(0,this.value.length);}};
 const render=()=>{const input=Component({value,onChange:next=>{value=next;}});element.value=input.props.value;return input;};
 render().props.onFocus({currentTarget:element});
 return {element,get value(){return value;},get display(){return render().props.value;},key(key){let prevented=false;render().props.onKeyDown({key,currentTarget:element,preventDefault(){prevented=true;}});return prevented;},mobile(data){render().props.onBeforeInput({data,nativeEvent:{},currentTarget:element,preventDefault(){}});}};
}
test('clock mask remains visible and 7 then 3 means 07:30 immediately',()=>{
 const e=editor(TimeInput);
 assert.equal(e.display,'00:00');
 e.key('7');assert.equal(e.display,'07:00');assert.equal(e.value,'07:00:00');
 e.key('3');assert.equal(e.display,'07:30');assert.equal(e.value,'07:30:00');
 e.key('0');assert.equal(e.display,'07:30');
});
test('clock mask accepts 0730, 22 and mobile digit input without blur',()=>{
 for(const [digits,expected] of [['0730','07:30'],['22','22:00'],['8','08:00']]) {
  for(const mode of ['key','mobile']) {
   const e=editor(TimeInput,'12:45:00');
   for(const d of digits)e[mode](d);
   assert.equal(e.display,expected);
  }
 }
});
test('duration mask preserves long hours and seconds while typing and pasting',()=>{
 for(const [digits,expected] of [['0800','08:00'],['3630','36:30']]) {
  const e=editor(DurationInput);for(const d of digits)e.key(d);assert.equal(e.display,expected);
 }
 const e=editor(DurationInput,'168:12:34');for(const d of '168')e.key(d);assert.equal(e.display,'168:00');
 const long=editor(DurationInput);long.key('1');long.key('6');long.element.setSelectionRange(2,2);long.key('8');assert.equal(long.value,'168:00:00');
});
test('selection replacement, deletion and arrow navigation preserve the mask',()=>{
 const e=editor(TimeInput,'22:45:00');e.element.setSelectionRange(3,5);e.key('3');assert.equal(e.display,'22:30');
 e.key('Backspace');assert.equal(e.display,'22:00');
 assert.equal(e.key('ArrowLeft'),false);assert.equal(e.key('Tab'),false);
 e.element.select();e.key('Delete');assert.equal(e.display,'00:00');assert.equal(e.value,'00:00:00');
});

test('weekly duration fields expose and edit seconds even when initially zero',()=>{
 let value='08:48:00';
 const input=DurationInput({value,showSeconds:true,onChange:next=>value=next});
 assert.equal(input.props.value,'08:48:00');
 input.props.onChange({currentTarget:{value:'08:48:01',setSelectionRange(){}}});
 assert.equal(value,'08:48:01');
});
