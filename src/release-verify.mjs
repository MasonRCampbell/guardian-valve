import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {recordFailure} from './failure-register.mjs';
const configPath=process.argv[2];
if(!configPath){console.error('Usage: node release-verify.mjs <release.json>');process.exit(2)}
const output=resolve(process.env.VALVE_RELEASE_PROOFS||'C:/ProgramData/ValvePipeline/proofs');
function git(cwd,...a){const r=spawnSync('git',a,{cwd,encoding:'utf8',timeout:20000,windowsHide:true});if(r.status)throw Error('Git verification failed: '+(r.stderr||r.status));return r.stdout.trim()}
async function main(){
const c=JSON.parse(readFileSync(configPath,'utf8'));
if(!c.project||!c.repository||!c.branch||!c.sha||!c.deployments)throw Error('Incomplete release verification request');
const actual=git(c.repository,'ls-remote','origin','refs/heads/'+c.branch).split(/\s/)[0];
if(actual!==c.sha)throw Error('Remote revision mismatch: target release is not at remote branch tip');
const checks=[{target:'git',ok:true,revision:actual}];
for(const d of c.deployments){
if(d.type==='http-revision'){
const response=await fetch(d.url,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{'cache-control':'no-cache'}});
if(!response.ok)throw Error('HTTP verifier failed '+response.status);
const obj=await response.json();
if(obj.commit!==c.sha && obj.sha!==c.sha)throw Error('Deployed revision mismatch for '+d.name);
checks.push({target:d.name,ok:true,revision:c.sha});
}else if(d.type==='supabase-migration-proof'){
if(!d.verifiedMigrationIds||!d.expectedMigrationIds)throw Error('Missing migration attestations');
const missing=d.expectedMigrationIds.filter(id=>!d.verifiedMigrationIds.includes(id));
if(missing.length)throw Error('Supabase migrations unverified: '+missing.join(','));
checks.push({target:d.name,ok:true,migrationCount:d.expectedMigrationIds.length});
}else throw Error('Unconfigured deployment adapter '+d.type);
}
const result={project:c.project,sha:c.sha,verified_at:new Date().toISOString(),status:'verified',checks};
mkdirSync(output,{recursive:true});writeFileSync(resolve(output,c.project+'-'+c.sha.slice(0,12)+'.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
}
main().catch(e=>{try{recordFailure({project:'Valve',operation:'release-verification',category:'deployment-unverified',message:e.message})}catch{}console.error(e.message);process.exitCode=1});
