import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {createHmac} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dispatcher=fileURLToPath(new URL('../src/event-dispatcher.mjs',import.meta.url));
function git(cwd,...args){const r=spawnSync('git',args,{cwd,encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
async function until(predicate,timeout=25000){const start=Date.now();while(Date.now()-start<timeout){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,250));}throw Error('Timed out waiting for dispatcher release');}
test('signed queue release survives dispatcher interruption without duplicate commits', {timeout:75000}, async()=>{
 const root=mkdtempSync(join(tmpdir(),'valve-dispatch-')),remote=join(root,'remote.git'),work=join(root,'work'),queue=join(root,'queue'),registry=join(root,'projects.json'),log=join(root,'failures.jsonl');
 mkdirSync(work);mkdirSync(queue);
 git(root,'init','--bare',remote);git(work,'init','-b','main');git(work,'config','user.name','Queue Test');git(work,'config','user.email','queue@example.invalid');git(work,'remote','add','origin',remote);
 writeFileSync(join(work,'data.txt'),'initial');git(work,'add','data.txt');git(work,'commit','-m','initial');git(work,'push','-u','origin','main');
 writeFileSync(registry,JSON.stringify({projects:[{id:'QueueTest',path:work,branch:'main',remote:'origin'}]}));
 const key='unit-test-only-a-long-signing-secret-for-isolated-queue';
 const environment={...process.env,VALVE_QUEUE_DIR:queue,VALVE_PROJECTS_FILE:registry,VALVE_FAILURE_LOG:log,VALVE_SIGNING_KEY:key,VALVE_GITHUB_TOKEN:'test-only-token',VALVE_GITHUB_WATCH_STATE:join(root,'watch.json')};
 function launch(){return spawn(process.execPath,[dispatcher],{env:environment,cwd:root,windowsHide:true,stdio:'ignore'});}
 function stage(value){writeFileSync(join(work,'data.txt'),value);const m={project:'QueueTest',repository:work,branch:'main',approved:true,publish:true,paths:['data.txt'],message:'test: queued '+value,checks:[]};writeFileSync(join(queue,'release-QueueTest.json'),JSON.stringify({...m,signature:createHmac('sha256',key).update(JSON.stringify(m)).digest('hex')}));}
 let child=launch();
 try{
  stage('version-one');
  await until(()=>readdirSync(queue).some(x=>x.startsWith('release-QueueTest.json.submitted-')));
  assert.equal(git(work,'show','HEAD:data.txt'),'version-one');
  child.kill();
  await new Promise(resolve=>setTimeout(resolve,600));
  stage('version-two');
  child=launch();
  await until(()=>readdirSync(queue).filter(x=>x.startsWith('release-QueueTest.json.submitted-')).length===2);
  assert.equal(git(work,'show','HEAD:data.txt'),'version-two');
  assert.equal(git(root,'--git-dir='+remote,'rev-list','--count','main'),'3');
 }finally{child.kill();}
});
