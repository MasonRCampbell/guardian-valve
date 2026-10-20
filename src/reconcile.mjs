import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
const registryPath=resolve(process.env.VALVE_PROJECTS_FILE||'C:/GuardianControl/Valve/projects.json');
const outputPath=resolve(process.env.VALVE_RECONCILE_FILE||'C:/ProgramData/ValvePipeline/reconciliation.json');
function run(cwd,...args){
 const x=spawnSync('git',args,{cwd,encoding:'utf8',windowsHide:true,timeout:20000});
 return {ok:x.status===0&&!x.error,value:(x.stdout||'').trim(),error:x.error?.message||(x.stderr||'').trim()};
}
function inspect(p){
 const root=resolve(p.path), blockers=[], notices=[];
 const status=run(root,'status','--porcelain','--untracked-files=normal');
 const head=run(root,'rev-parse','HEAD');
 const branch=run(root,'branch','--show-current');
 const checkout=branch.ok?branch.value:'';
 const remote=p.remote||'origin';
 const releaseBranch=p.branch;
 const development=Boolean(checkout && checkout!==releaseBranch);
 // Branch-relative comparison; do not compare the feature HEAD to origin/main.
 const target=remote+'/'+checkout;
 const upstream=checkout?run(root,'rev-parse',target):{ok:false,value:''};
 const counts=checkout?run(root,'rev-list','--left-right','--count','HEAD...'+target):{ok:false,value:''};
 const conflicts=run(root,'ls-files','-u');
 if(!status.ok)blockers.push('git-status-unavailable');
 if(!head.ok||!branch.ok||!checkout)blockers.push('repository-unavailable');
 if(!conflicts.ok||conflicts.value)blockers.push('merge-conflict');
 const parts=counts.ok?counts.value.split(/\s+/).map(Number):[];
 const ahead=parts.length===2&&parts.every(Number.isFinite)?parts[0]:null;
 const behind=parts.length===2&&parts.every(Number.isFinite)?parts[1]:null;
 const changes=status.ok?status.value.split(/\r?\n/).filter(Boolean):[];
 if(development)notices.push('development-branch');
 if(changes.length)notices.push('uncommitted-work');
 if(!upstream.ok||ahead===null||behind===null) {
   if(development)notices.push('tracking-unavailable');
   else blockers.push('release-tracking-unavailable');
 }else {
   if(ahead>0)(development?notices:blockers).push('unpublished-commits');
   if(behind>0)(development?notices:blockers).push('remote-ahead');
 }
 // Work pending on a feature branch is not an error or a blocked deployment.
 // Publication still requires an explicitly signed manifest and the strict release worker.
 const releaseEligible=!development&&!blockers.length;
 return {project:p.id,repository:root,branch:checkout,releaseBranch,head:head.ok?head.value:null,
   upstream:upstream.ok?upstream.value:null,ahead,behind,changedFileCount:changes.length,
   blocked:blockers.length>0,releaseEligible,status:blockers.length?'BLOCKED':development?'DEVELOPMENT':'READY',
   issues:blockers,notices};
}
const registry=JSON.parse(readFileSync(registryPath,'utf8'));
if(!Array.isArray(registry.projects))throw Error('Invalid project registry');
const state={checkedAt:new Date().toISOString(),projects:registry.projects.map(inspect)};
mkdirSync(dirname(outputPath),{recursive:true});
writeFileSync(outputPath+'.tmp',JSON.stringify(state,null,2));
renameSync(outputPath+'.tmp',outputPath);
console.log(JSON.stringify(state));
