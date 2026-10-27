const fs=require('node:fs'),path=require('node:path'),{sample}=require('./performance-benchmark.cjs');
const [base,after,out]=process.argv.slice(2).map(p=>path.resolve(p));const rows=[];
for(const [scenario,operation]of [['small-fixed','analyze'],['candidate-limit','solve'],['history-limit','analyze']])for(let repetition=0;repetition<5;repetition++)for(const version of repetition%2?['after','baseline']:['baseline','after']){
 const r={scenario,operation,repetition,version,...sample(version==='after'?after:base,scenario,operation)};rows.push(r);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'paired-samples.json'),JSON.stringify(rows,null,2));console.log(JSON.stringify({scenario,operation,repetition,version,ms:r.elapsedMs}));
}
