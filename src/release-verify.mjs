import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {recordFailure} from './failure-register.mjs';

const configPath=process.argv[2];
if(!configPath){console.error('Usage: node release-verify.mjs <release.json>');process.exit(2)}
const output=resolve(process.env.VALVE_RELEASE_PROOFS||'C:/ProgramData/ValvePipeline/proofs');
function assert(x,msg){if(!x)throw Error(msg)}
function git(cwd,...args){
 const r=spawnSync('git',args,{cwd,encoding:'utf8',timeout:20000,windowsHide:true});
 if(r.error||r.status!==0)throw Error('Git verification failed: '+(r.stderr||r.error?.message||r.status));
 return r.stdout.trim();
}
async function supabaseMigrationProof(d){
 assert(/^[a-z0-9]{20}$/.test(d.projectRef||''),'Invalid Supabase project reference');
 assert(Array.isArray(d.expectedMigrationIds)&&d.expectedMigrationIds.length>0,'Expected migration IDs required');
 assert(d.expectedMigrationIds.every(x=>/^\d{14}$/.test(x)),'Invalid expected migration ID');
 assert(process.env.SUPABASE_ACCESS_TOKEN,'Supabase token unavailable for live migration verification');
 const refs=d.expectedMigrationIds.map(x=>"'"+x+"'").join(',');
 const response=await fetch('https://api.supabase.com/v1/projects/'+d.projectRef+'/database/query',{
  method:'POST',headers:{'Authorization':'Bearer '+process.env.SUPABASE_ACCESS_TOKEN,'Content-Type':'application/json'},
  body:JSON.stringify({query:'select version from supabase_migrations.schema_migrations where version in ('+refs+')',read_only:true}),
  signal:AbortSignal.timeout(20000)
 });
 assert(response.status===201,'Supabase read-only migration verification returned HTTP '+response.status);
 const body=await response.json();
 const rows=Array.isArray(body)?body:(body.result??body.data);
 assert(Array.isArray(rows),'Unexpected Supabase query response');
 const actual=new Set(rows.map(row=>row.version));
 const missing=d.expectedMigrationIds.filter(id=>!actual.has(id));
 assert(!missing.length,'Production Supabase migrations missing: '+missing.join(','));
 return {target:d.name||'Supabase',ok:true,source:'live-supabase-query',migrationCount:d.expectedMigrationIds.length};
}
async function main(){
 const c=JSON.parse(readFileSync(configPath,'utf8'));
 assert(c.project&&c.repository&&c.branch&&/^[a-f0-9]{40}$/.test(c.sha||'')&&Array.isArray(c.deployments),'Incomplete release verification request');
 const remote=git(c.repository,'ls-remote','origin','refs/heads/'+c.branch);
 const actual=remote.split(/\s+/)[0];
 assert(actual===c.sha,'Remote revision mismatch: target release is not at remote branch tip');
 const checks=[{target:'git',ok:true,revision:actual}];
 for(const d of c.deployments){
  if(d.type==='http-revision'){
   const url=new URL(d.url);
   assert(url.protocol==='https:','Only HTTPS release endpoints are supported');
   const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{'cache-control':'no-cache'}});
   assert(response.ok,'HTTP verifier failed '+response.status);
   const obj=await response.json();
   assert(obj.commit===c.sha||obj.sha===c.sha,'Deployed revision mismatch for '+d.name);
   checks.push({target:d.name,ok:true,revision:c.sha});
  }else if(d.type==='supabase-migration-proof'){
   checks.push(await supabaseMigrationProof(d));
  }else throw Error('Unconfigured deployment adapter '+d.type);
 }
 const result={project:c.project,sha:c.sha,verified_at:new Date().toISOString(),status:'verified',checks};
 mkdirSync(output,{recursive:true});
 writeFileSync(resolve(output,c.project+'-'+c.sha.slice(0,12)+'.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
}
main().catch(e=>{
 try{recordFailure({project:'Valve',operation:'release-verification',category:'deployment-unverified',message:e.message})}catch{}
 console.error(e.message);process.exitCode=1;
});
