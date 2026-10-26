const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const directory=path.join(__dirname,'../src/lib/policies');
const files=fs.readdirSync(directory).filter(f=>f.endsWith('.ts'));
function violations(source) {
 const root=ts.createSourceFile('policy.ts',source,ts.ScriptTarget.Latest,true),issues=[];
 const forbiddenClock=new Set(['getHours','getDay','getMonth','getDate','getFullYear','getTimezoneOffset','setHours','setDate','setMonth','setFullYear']);
 function visit(node) {
  if(ts.isImportDeclaration(node)) {
   const spec=node.moduleSpecifier.text;
   if(!spec.startsWith('.')||/store|components|queuedSolve|\/api$/.test(spec))issues.push('dependency: '+spec);
  }
  if(ts.isIdentifier(node)&&['window','localStorage','fetch','document'].includes(node.text))issues.push('ambient: '+node.text);
  if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&forbiddenClock.has(node.expression.name.text))issues.push('device clock: '+node.expression.name.text);
  ts.forEachChild(node,visit);
 }
 visit(root);return issues;
}
test('scheduling policies have no UI, state, HTTP or ambient browser dependency',()=>{
 assert.equal(files.length,6);
 for(const file of files)assert.deepEqual(violations(fs.readFileSync(path.join(directory,file),'utf8')),[],file);
});
test('architecture scanner rejects forbidden dependencies and device clock calls',()=>{
 const actual=violations('import {useState} from "react"; window.localStorage; new Date().getHours();');
 assert.ok(actual.some(v=>v.includes('react')));assert.ok(actual.some(v=>v.includes('ambient')));assert.ok(actual.some(v=>v.includes('getHours')));
});
