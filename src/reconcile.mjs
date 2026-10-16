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
 const root=resolve(p.path), failures=[];
 const status=run(root,'status','--porcelain','--untracked-files=normal');
 const head=run(root,'rev-parse','HEAD');
 const upstream=run(root,'rev-parse',p.remote+'/'+p.branch);
 const counts=run(root,'rev-list','--left-right','--count','HEAD...'+p.remote+'/'+p.branch);
 const branch=run(root,'branch','--show-current');
 const conflicts=run(root,'ls-files','-u');
 if(!status.ok)failures.push('git-status-unavailable');
 if(!head.ok||!upstream.ok||!counts.ok)failures.push('upstream-unavailable');
 if(!branch.ok||branch.value!==p.branch)failures.push('branch-mismatch');
 if(!conflicts.ok||conflicts.value)failures.push('merge-conflict');
 const parts=counts.value.split(/\s+/).map(Number);
 const ahead=counts.ok&&parts.length===2&&parts.every(Number.isFinite)?parts[0]:null;
 const behind=counts.ok&&parts.length===2&&parts.every(Number.isFinite)?parts[1]:null;
 const changes=status.ok?status.value.split(/\r?\n/).filter(Boolean):[];
 if(changes.length)failures.push('uncommitted-work');
 if(ahead===null||behind===null)failures.push('divergence-unknown');
 else {if(ahead>0)failures.push('unpublished-commits');if(behind>0)failures.push('remote-ahead');}
 return {project:p.id,repository:root,branch:p.branch,head:head.ok?head.value:null,upstream:upstream.ok?upstream.value:null,ahead,behind,changedFileCount:changes.length,blocked:failures.length>0,issues:failures};
}
const registry=JSON.parse(readFileSync(registryPath,'utf8'));
if(!Array.isArray(registry.projects))throw Error('Invalid project registry');
const state={checkedAt:new Date().toISOString(),projects:registry.projects.map(inspect)};
mkdirSync(dirname(outputPath),{recursive:true});
writeFileSync(outputPath+'.tmp',JSON.stringify(state,null,2));
renameSync(outputPath+'.tmp',outputPath);
console.log(JSON.stringify(state));
