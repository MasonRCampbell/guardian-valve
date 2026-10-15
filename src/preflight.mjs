import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { recordFailure } from './failure-register.mjs';
const config = JSON.parse(readFileSync(resolve(process.env.VALVE_PROJECTS_FILE || 'C:/GuardianControl/Valve/projects.json'),'utf8'));
let failed=0;
for(const p of config.projects||[]){
 const checks=[];
 const path=resolve(p.path);
 checks.push({check:'repository-present',ok:existsSync(path)});
 if(existsSync(path)){
   for(const [name,args] of [['git-repository',['rev-parse','--is-inside-work-tree']],['branch',['branch','--show-current']],['conflicts',['ls-files','-u']]]){
    const r=spawnSync('git',args,{cwd:path,encoding:'utf8',timeout:20000,windowsHide:true});
    const output=(r.stdout||'').trim();
    const ok=r.status===0&&(name==='branch'? output===p.branch :name==='conflicts'?!output:output==='true');
    checks.push({check:name,ok,detail:name==='branch'?output:undefined});
   }
 }
 for(const c of checks)if(!c.ok){failed++;recordFailure({project:p.id,operation:'preflight',category:c.check,message:'Preflight gate failed'+(c.detail?': '+c.detail:''),retryable:false});}
 console.log(JSON.stringify({project:p.id,ready:checks.every(c=>c.ok),checks}));
}
if(failed)process.exitCode=1;
