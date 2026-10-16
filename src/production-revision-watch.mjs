import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
const state='C:/ProgramData/ValvePipeline/production-revision.json';
export async function verifySitRepProduction(){
 const expected=execFileSync('git',['-C','C:/SitRepManagement','rev-parse','origin/main'],{encoding:'utf8'}).trim();
 let actual=null,error=null;
 try {const response=await fetch('https://sitrep.management/api/version',{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('HTTP '+response.status); const body=await response.json();actual=body.commit||body.sha;if(!/^[a-f0-9]{40}$/i.test(actual||''))throw Error('Invalid production revision');}catch(e){error=String(e.message)}
 const result={checkedAt:new Date().toISOString(),expected,actual,error,status:error?'unreachable':actual===expected?'verified':'behind'};
 mkdirSync('C:/ProgramData/ValvePipeline',{recursive:true});
 const previous=existsSync(state)?JSON.parse(readFileSync(state,'utf8')):null;
 writeFileSync(state,JSON.stringify(result,null,2));
 if(result.status!=='verified' && (previous?.expected!==expected||previous?.actual!==actual||previous?.status!==result.status))console.error('SITREP_PRODUCTION_NOT_CURRENT',JSON.stringify(result));
 return result;
}
if(process.argv[1]?.includes('production-revision-watch.mjs'))verifySitRepProduction().then(x=>{console.log(JSON.stringify(x));if(x.status!=='verified')process.exitCode=1}).catch(e=>{console.error(e.message);process.exitCode=1});