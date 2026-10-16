import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
const installed='C:/GuardianControl/Valve/bin/';
function command(cwd,cmd,...args){const r=spawnSync(cmd,args,{cwd,encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(r.status,0,r.stderr);return r.stdout.trim()}
async function until(fn,ms=25000){const start=Date.now();while(Date.now()-start<ms){if(fn())return;await new Promise(r=>setTimeout(r,250));}throw Error('Timed out waiting for installed Valve release');}
test('installed Guardian submission to dispatcher to Git remote completes exactly once', {timeout:60000}, async()=>{
 const d=mkdtempSync(join(tmpdir(),'valve-v10-')),work=join(d,'work'),bare=join(d,'remote.git'),queue=join(d,'queue');
 mkdirSync(work);mkdirSync(queue);
 command(d,'git','init','--bare',bare);
 command(work,'git','init','-b','main');
 command(work,'git','config','user.name','Valve Acceptance');
 command(work,'git','config','user.email','valve-acceptance@example.invalid');
 command(work,'git','remote','add','origin',bare);
 writeFileSync(join(work,'item.txt'),'old');
 command(work,'git','add','item.txt');command(work,'git','commit','-m','seed');command(work,'git','push','-u','origin','main');
 writeFileSync(join(work,'item.txt'),'approved new version');
 const registry=join(d,'registry.json'),req=join(d,'request.json');
 writeFileSync(registry,JSON.stringify({projects:[{id:'Demo',path:work,branch:'main',remote:'origin'}]}));
 writeFileSync(req,JSON.stringify({project:'Demo',approved:true,publish:true,paths:['item.txt'],message:'V10 isolated proof',checks:[[process.execPath,'--version']]}));
 const env={...process.env,VALVE_PROJECTS_FILE:registry,VALVE_QUEUE_DIR:queue,VALVE_FAILURE_LOG:join(d,'failures.jsonl'),VALVE_GITHUB_WATCH_STATE:join(d,'watch.json'),VALVE_SIGNING_KEY:'v10-only-isolated-long-signing-key-0123456789',VALVE_GITHUB_TOKEN:'isolated-test-token'};
 const submit=spawnSync(process.execPath,[installed+'submit-release.mjs',req],{env,encoding:'utf8',windowsHide:true,timeout:10000});
 assert.equal(submit.status,0,submit.stderr);
 let child=spawn(process.execPath,[installed+'event-dispatcher.mjs'],{env,windowsHide:true,stdio:'ignore'});
 try{
  await until(()=>readdirSync(queue).some(f=>f.includes('.submitted-')));
  assert.equal(command(d,'git','--git-dir='+bare,'show','main:item.txt'),'approved new version');
  assert.equal(command(d,'git','--git-dir='+bare,'rev-list','--count','main'),'2');
 }finally{child.kill();}
});
