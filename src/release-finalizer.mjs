import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync,readdirSync} from 'node:fs';
import {resolve,join,dirname,basename} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const registryFile=resolve(process.env.VALVE_PROJECTS_FILE||'C:/GuardianControl/Valve/projects.json');
const queue=resolve(process.env.VALVE_QUEUE_DIR||'C:/ProgramData/ValvePipeline/approved');
const ledger=resolve(process.env.VALVE_RELEASE_LEDGER||'C:/ProgramData/ValvePipeline/releases');
const proofs=resolve(process.env.VALVE_RELEASE_PROOFS||'C:/ProgramData/ValvePipeline/proofs');
const verifier=resolve(new URL('./release-verify.mjs',import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/,''));
function git(cwd,...args){const r=spawnSync('git',args,{cwd,encoding:'utf8',timeout:20000,windowsHide:true});if(r.status!==0||r.error)throw Error('git '+args[0]+' failed');return r.stdout.trim()}
function save(path,record){mkdirSync(dirname(path),{recursive:true});writeFileSync(path+'.tmp',JSON.stringify(record,null,2));renameSync(path+'.tmp',path)}
function output(id,status,details){return {id,status,checkedAt:new Date().toISOString(),...details}}
function reconcileOne(file,registry){
 const name=basename(file),id=createHash('sha256').update(name).digest('hex').slice(0,20),stateFile=join(ledger,id+'.json');
 const old=existsSync(stateFile)?JSON.parse(readFileSync(stateFile,'utf8')):null;
 if(old?.status==='verified'||old?.status==='blocked')return old;
 const match=name.match(/^release-([A-Za-z0-9_-]+)-.*\.json\.submitted-([a-f0-9]{12})$/);
 if(!match)return null;
 const m=JSON.parse(readFileSync(file,'utf8'));
 const project=registry.projects.find(p=>p.id===m.project);
 if(!project||resolve(project.path)!==resolve(m.repository)||project.branch!==m.branch){
  const result=output(id,'blocked',{project:m.project,reason:'Registry mismatch'});save(stateFile,result);return result;
 }
 const head=git(project.path,'rev-parse','HEAD');
 if(!head.startsWith(match[2])){const result=output(id,'superseded',{project:m.project,reason:'A newer local revision replaced this historical submission'});save(stateFile,result);return result}
 const remote=git(project.path,'ls-remote','origin','refs/heads/'+project.branch).split(/\s+/)[0];
 if(remote!==head){const result=output(id,'pending',{project:m.project,sha:head,reason:'GitHub branch does not match submitted revision'});save(stateFile,result);return result}
 const deployments=Array.isArray(project.deployments)?project.deployments:null;
 if(!deployments||deployments.length===0){const result=output(id,'pending',{project:m.project,sha:head,reason:'Production deployment targets have not been configured'});save(stateFile,result);return result}
 const config={project:m.project,repository:project.path,branch:project.branch,sha:head,deployments};
 const requestPath=join(ledger,id+'-verification.json');
 save(requestPath,config);
 const child=spawnSync(process.execPath,[verifier,requestPath],{encoding:'utf8',timeout:120000,windowsHide:true});
 const proof=join(proofs,m.project+'-'+head.slice(0,12)+'.json');
 if(child.status!==0||!existsSync(proof)){const result=output(id,'pending',{project:m.project,sha:head,reason:'Production verification incomplete',retryable:true});save(stateFile,result);return result}
 const verified=JSON.parse(readFileSync(proof,'utf8'));
 if(verified.sha!==head||verified.status!=='verified'||verified.checks?.length!==deployments.length+1){const result=output(id,'pending',{project:m.project,sha:head,reason:'Verification proof incomplete'});save(stateFile,result);return result}
 const result=output(id,'verified',{project:m.project,sha:head,checks:verified.checks});save(stateFile,result);return result;
}
export function reconcileReleases(){
 const registry=JSON.parse(readFileSync(registryFile,'utf8'));
 if(!Array.isArray(registry.projects))throw Error('Invalid registry');
 if(!existsSync(queue))return [];
 const results=[];
 for(const name of readdirSync(queue).filter(n=>n.includes('.submitted-'))){
  try{const result=reconcileOne(join(queue,name),registry);if(result)results.push(result)}
  catch(e){results.push({file:name,status:'error',message:String(e.message).slice(0,200)})}
 }
 return results;
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/,'')))console.log(JSON.stringify(reconcileReleases()));
