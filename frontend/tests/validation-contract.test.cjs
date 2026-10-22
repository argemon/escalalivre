const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const fixtures=require('../../shared/document-validation-scenarios.json');
const harness=fs.readFileSync(path.join(__dirname,'recovery.test.cjs'),'utf8').split("test('native exports")[0];
const {load}=vm.runInNewContext(harness+';session(memory());',{require,__dirname,Date,Map,Set,TextEncoder,Intl,crypto,structuredClone});
const {documentSchema}=load('lib/documentSchema.ts'),native=load('lib/nativeDocument.ts');
function documentFor(scenario){
  const doc=structuredClone(fixtures.document);
  for(const change of scenario.changes){
    const parent=change.path.slice(0,-1).reduce((value,key)=>value[key],doc),key=change.path.at(-1);
    if('repeat' in change){
      const template=parent[key][0];parent[key]=Array.from({length:change.repeat},(_,i)=>{
        const value=structuredClone(template);
        if(change.uniqueIds && i>0)value.id='11111111-1111-4111-8111-'+String(i).padStart(12,'0');
        return value;
      });
    }else parent[key]=structuredClone(change.value);
  }
  return doc;
}
for(const scenario of fixtures.scenarios)test('shared document acceptance: '+scenario.id,()=>{
  const doc=documentFor(scenario),result=documentSchema.safeParse(doc);
  assert.equal(result.success,scenario.accepted,result.error?.message);
  const raw=JSON.stringify(doc);
  if(Buffer.byteLength(raw)<=native.MAX_NATIVE_BYTES){
    if(scenario.accepted)assert.doesNotThrow(()=>native.parseNativeText(raw));
    else assert.throws(()=>native.parseNativeText(raw));
  }
});
