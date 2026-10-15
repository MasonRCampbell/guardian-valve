import {readFileSync,writeFileSync,existsSync,renameSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';

const file=resolve(process.env.VALVE_PROJECTS_FILE||'C:/GuardianControl/Valve/projects.json');
const [command,id,path,branch='main']=process.argv.slice(2);
const current=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{schemaVersion:1,mode:'manual-approved-only',projects:[]};
if(!Array.isArray(current.projects))throw Error('Invalid registry');
function git(cwd,...args){
 const r=spawnSync('git',args,{cwd,encoding:'utf8',windowsHide:true,timeout:15000});
 if(r.status!==0||r.error)throw Error('Git verification failed for '+args[0]);
 return r.stdout.trim();
}
if(command==='list'){
 for(const project of current.projects)console.log(JSON.stringify(project));
}else if(command==='add'){
 if(!/^[A-Za-z][\w-]{1,49}$/.test(id||''))throw Error('Invalid project identifier');
 if(!path)throw Error('Project path required');
 if(!/^[A-Za-z0-9/_-]+$/.test(branch))throw Error('Invalid branch name');
 const full=resolve(path);
 if(!existsSync(full)||git(full,'rev-parse','--is-inside-work-tree')!=='true')throw Error('Not a Git repository');
 if(git(full,'branch','--show-current')!==branch)throw Error('Branch mismatch');
 const configured=git(full,'remote','get-url','origin');
 if(!/^https:\/\/github\.com\/[^/\s]+\/[^/\s]+(?:\.git)?$/.test(configured)&&!/^git@github\.com:[^\s]+\/[^\s]+(?:\.git)?$/.test(configured))
   throw Error('Expected a configured GitHub origin remote');
 const duplicate=current.projects.find(p=>p.id===id||resolve(p.path).toLowerCase()===full.toLowerCase());
 if(duplicate)throw Error('Project already registered');
 current.projects.push({id,path:full,branch,remote:'origin'});
 mkdirSync(dirname(file),{recursive:true});
 const temp=file+'.new-'+process.pid;
 writeFileSync(temp,JSON.stringify(current,null,2)+'\n');
 renameSync(temp,file);
 console.log(JSON.stringify({status:'registered',id,path:full,branch,remote:'origin'}));
}else{
 console.error('Usage: node register-project.mjs list | add <project-id> <repository-path> [branch]');
 process.exitCode=2;
}
