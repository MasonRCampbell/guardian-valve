import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export function validateSlug(name) {
  if (!/^[a-z][a-z0-9-]{2,70}$/.test(name || '') || name.endsWith('-') || name.includes('--')) throw Error('Invalid repository name');
  return name;
}
export function resolveCredential() {
  const token=process.env.VALVE_GITHUB_TOKEN || process.env.GH_TOKEN;
  if(token) return token;
  const r=spawnSync('git',['credential','fill'],{
    input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',windowsHide:true,timeout:12000
  });
  if(r.error || r.status!==0) throw Error('GitHub credential helper unavailable');
  const password=r.stdout.match(/^password=(.+)$/m);
  if(!password) throw Error('GitHub token missing: configure a credential with repository creation access');
  return password[1].trim();
}
export async function bootstrapRepository({name,description='',owner='MasonRCampbell',privateRepo=true,dryRun=false,token,fetchImpl=fetch}) {
  name=validateSlug(name);
  if(!/^[A-Za-z0-9-]{1,39}$/.test(owner)) throw Error('Invalid owner');
  if(!privateRepo) throw Error('Valve requires private repositories by default');
  if(dryRun) return {status:'DRY_RUN',name,owner,private:true};
  token=token || resolveCredential();
  const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json','User-Agent':'Valve-project-bootstrap'};
  const get=await fetchImpl('https://api.github.com/repos/'+owner+'/'+name,{headers,signal:AbortSignal.timeout(20000)});
  if(get.ok) return {status:'EXISTS',owner,name,private:(await get.json()).private};
  if(get.status!==404) throw Error('GitHub repository lookup HTTP '+get.status);
  const response=await fetchImpl('https://api.github.com/user/repos',{
    method:'POST',headers,body:JSON.stringify({name,description,private:true,auto_init:false}),signal:AbortSignal.timeout(30000)
  });
  if(!response.ok) throw Error('GitHub create repository HTTP '+response.status+'; requires repository administration access');
  const obj=await response.json();
  if(obj.full_name!==owner+'/'+name || obj.private!==true) throw Error('Created repository metadata mismatch');
  return {status:'CREATED',owner,name,private:true,cloneUrl:obj.clone_url};
}
const isMain=process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isMain) {
 const [name,description='']=process.argv.slice(2);
 bootstrapRepository({name,description,dryRun:process.argv.includes('--dry-run')})
 .then(r=>console.log(JSON.stringify(r)))
 .catch(e=>{console.error(e.message);process.exitCode=1});
}
