const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
module.exports=function sourceLoader(storage) {
  const cache=new Map();const data=new Map();storage??={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  function load(file) {
    if(file.endsWith('.json.ts'))return {default:JSON.parse(fs.readFileSync(path.join(__dirname,'../src',file.replace(/\.ts$/,'')),'utf8'))};
    if(cache.has(file))return cache.get(file);
    const exports={};cache.set(file,exports);
    const source=fs.readFileSync(path.join(__dirname,'../src',file),'utf8');
    const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(code,{exports,Date,Set,Map,Intl,TextEncoder,crypto,structuredClone,window:{localStorage:storage},require:r=>r.startsWith('.')?load(path.posix.normalize(path.posix.join(path.posix.dirname(file),r))+'.ts'):require(r)});
    return exports;
  }
  return load;
};
