import {readFileSync,writeFileSync,renameSync,existsSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {recordFailure} from './failure-register.mjs';

export function githubRepo(remote){
 const value=String(remote||'').trim();
 const match=value.match(/^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i);
 return match ? match[1] : null;
}
function readGitCredential(){
 const r=spawnSync('git',['credential','fill'],{
  input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',
  timeout:10000,windowsHide:true
 });
 if(r.status!==0||r.error)return null;
 return r.stdout.split(/\r?\n/).find(s=>s.startsWith('password='))?.slice(9)||null;
}
function readProjects(path){
 const data=JSON.parse(readFileSync(path,'utf8'));
 const projects=Array.isArray(data.projects)?data.projects:[];
 return projects.some(p=>p.id==='Valve') ? projects : [{id:'Valve',path:resolve('C:/GuardianControl/ValveSource'),branch:'main',remote:'origin'},...projects];
}
export async function scanGitHub(options={}){
 const registry=resolve(options.registry||process.env.VALVE_PROJECTS_FILE||'C:/GuardianControl/Valve/projects.json');
 const statePath=resolve(options.statePath||process.env.VALVE_GITHUB_WATCH_STATE||'C:/ProgramData/ValvePipeline/github-watch-state.json');
 const token=options.token||process.env.VALVE_GITHUB_TOKEN||process.env.GH_TOKEN||readGitCredential();
 if(!token)throw Error('Valve GitHub watcher: no GitHub API credential available');
 const state=existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')):{schemaVersion:1,seen:{},latest:{}};
 if(!state.seen||typeof state.seen!=='object')throw Error('Invalid GitHub watcher state');
 const projects=options.projects||readProjects(registry);
 const failures=[];
 for(const project of projects){
  const git=spawnSync('git',['remote','get-url',project.remote||'origin'],{
   cwd:project.path,encoding:'utf8',windowsHide:true,timeout:15000
  });
  if(git.status!==0||git.error)continue;
  const name=githubRepo(git.stdout);
  if(!name)continue;
  const url='https://api.github.com/repos/'+name+'/actions/runs?per_page=40';
  let response;
  try{
   response=await (options.fetchImpl||fetch)(url,{headers:{
    'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json',
    'User-Agent':'Valve-CI-failure-watch'
   },signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw Error('HTTP '+response.status);
   const body=await response.json();
   if(!Array.isArray(body.workflow_runs))throw Error('Missing workflow_runs');
   state.latest[project.id]={repo:name,checkedAt:new Date().toISOString(),runs:body.workflow_runs.slice(0,12).map(r=>({
     id:r.id,name:r.name,status:r.status,conclusion:r.conclusion,sha:r.head_sha
   }))};
   for(const run of body.workflow_runs){
    if(run.status!=='completed')continue;
    const key=name+'#'+run.id;
    if(state.seen[key])continue;
    if(['failure','timed_out','startup_failure'].includes(run.conclusion)){
     const event={project:project.id,operation:'github-actions',category:'workflow-failure',
       message:'Workflow '+JSON.stringify(run.name||'unknown')+' run '+run.id+
        ' failed ('+run.conclusion+') on '+String(run.head_sha||'unknown').slice(0,40),
       commit:run.head_sha||null,retryable:false};
     (options.recordFailureImpl||recordFailure)(event);
     failures.push(key);
    }
    state.seen[key]=true;
   }
  }catch(e){
   (options.recordFailureImpl||recordFailure)({project:project.id,operation:'github-actions-watch',
     category:'github-api',message:'GitHub workflow lookup for '+name+' failed: '+e.message,retryable:true});
   failures.push(name+':lookup-failed');
  }
 }
 // Retain bounded durable history. Other failure events remain in the append-only JSONL register.
 const keys=Object.keys(state.seen);
 if(keys.length>4000){
  for(const k of keys.slice(0,keys.length-4000))delete state.seen[k];
 }
 state.checkedAt=new Date().toISOString();
 mkdirSync(dirname(statePath),{recursive:true});
 const temp=statePath+'.new-'+process.pid;
 writeFileSync(temp,JSON.stringify(state,null,2));
 renameSync(temp,statePath);
 return {projects:projects.map(p=>p.id),failureEvents:failures.length,checkedAt:state.checkedAt};
}
const isDirect=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isDirect){
 scanGitHub().then(x=>console.log(JSON.stringify(x))).catch(e=>{
  console.error('Valve GitHub watcher failed: '+e.message);process.exitCode=1;
 });
}

