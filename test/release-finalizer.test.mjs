import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const finalizer=fileURLToPath(new URL('../src/release-finalizer.mjs',import.meta.url));
function git(cwd,...args){const r=spawnSync('git',args,{cwd,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim()}
test('GitHub-pushed work remains pending without deployment verification targets',()=>{
 const d=mkdtempSync(join(tmpdir(),'valve-proof-')),work=join(d,'work'),bare=join(d,'remote.git'),queue=join(d,'queue'),ledger=join(d,'ledger');
 mkdirSync(work);mkdirSync(queue);
 git(d,'init','--bare',bare);git(work,'init','-b','main');git(work,'config','user.name','Test');git(work,'config','user.email','test@example.invalid');git(work,'remote','add','origin',bare);
 writeFileSync(join(work,'demo.txt'),'test');git(work,'add','demo.txt');git(work,'commit','-m','initial');git(work,'push','-u','origin','main');
 const sha=git(work,'rev-parse','HEAD');
 writeFileSync(join(d,'projects.json'),JSON.stringify({projects:[{id:'Example',path:work,branch:'main',remote:'origin'}]}));
 writeFileSync(join(queue,'release-Example-unit.json.submitted-'+sha.slice(0,12)),JSON.stringify({project:'Example',repository:work,branch:'main',paths:['demo.txt']}));
 const env={...process.env,VALVE_PROJECTS_FILE:join(d,'projects.json'),VALVE_QUEUE_DIR:queue,VALVE_RELEASE_LEDGER:ledger,VALVE_RELEASE_PROOFS:join(d,'proofs')};
 const a=spawnSync(process.execPath,[finalizer],{env,encoding:'utf8'});assert.equal(a.status,0,a.stderr);
 const obj=JSON.parse(a.stdout)[0];assert.equal(obj.status,'pending');assert.match(obj.reason,/not been configured/);
 const b=spawnSync(process.execPath,[finalizer],{env,encoding:'utf8'});assert.equal(b.status,0,b.stderr);
 assert.equal(readdirSync(ledger).filter(x=>x.endsWith('.json')).length,1);
 assert.equal(JSON.parse(b.stdout)[0].status,'pending');
});
