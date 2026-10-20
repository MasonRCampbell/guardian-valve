import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../src/',import.meta.url));
function run(file,args,cwd,env={}) {
 const r=spawnSync(file,args,{cwd,encoding:'utf8',windowsHide:true,timeout:90000,env:{...process.env,...env}});
 return r;
}
function git(args,cwd){const r=run('git',args,cwd);assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
test('feature branch is not a false release blocker and compares against its own origin',()=>{
 const dir=mkdtempSync(join(tmpdir(),'valve-feature-')),work=join(dir,'work'),bare=join(dir,'origin.git');
 mkdirSync(work); git(['init','--bare',bare],dir);git(['init','-b','main'],work);
 git(['config','user.name','Valve Test'],work);git(['config','user.email','valve-test@example.invalid'],work);
 git(['remote','add','origin',bare],work);writeFileSync(join(work,'file.txt'),'initial\n');
 git(['add','file.txt'],work);git(['commit','-m','start'],work);git(['push','-u','origin','main'],work);
 git(['switch','-c','feature/work-123'],work);
 git(['push','-u','origin','feature/work-123'],work);
 const registry=join(dir,'projects.json'),failures=join(dir,'failures.jsonl'),reconciliation=join(dir,'reconcile.json');
 writeFileSync(registry,JSON.stringify({projects:[{id:'fixture',path:work,branch:'main',remote:'origin'}]}));
 writeFileSync(join(work,'file.txt'),'uncommitted working change\n');
 const env={VALVE_PROJECTS_FILE:registry,VALVE_FAILURE_LOG:failures,VALVE_RECONCILE_FILE:reconciliation};
 const p=run(process.execPath,[join(root,'preflight.mjs')],dir,env);
 assert.equal(p.status,0,p.stderr+' '+p.stdout);
 const pre=JSON.parse(p.stdout.trim());
 assert.equal(pre.status,'development-checkout');
 assert.equal(pre.checkoutBranch,'feature/work-123');
 assert.equal(pre.ahead,0);assert.equal(pre.behind,0);
 assert.equal(existsSync(failures),false,'ordinary feature development must not create repetitive failures');
 const v=run(process.execPath,[join(root,'reconcile.mjs')],dir,env);
 assert.equal(v.status,0,v.stderr);
 const item=JSON.parse(v.stdout).projects[0];
 assert.equal(item.blocked,false);assert.equal(item.releaseEligible,false);
 assert.equal(item.status,'DEVELOPMENT');assert.equal(item.ahead,0);assert.equal(item.behind,0);
 git(['add','file.txt'],work);git(['commit','-m','local feature commit'],work);
 const next=run(process.execPath,[join(root,'reconcile.mjs')],dir,env);
 assert.equal(next.status,0,next.stderr);
 const newer=JSON.parse(next.stdout).projects[0];
 assert.equal(newer.ahead,1);assert.equal(newer.behind,0);
 assert.equal(newer.blocked,false);
 assert.ok(newer.notices.includes('unpublished-commits'));
});
test('failure logger spools locked or inaccessible failure records without crashing releases',()=>{
 const dir=mkdtempSync(join(tmpdir(),'valve-spool-')),bad=join(dir,'failures.jsonl'),spool=join(dir,'spool');
 mkdirSync(bad);
 const moduleUrl=new URL('../src/failure-register.mjs',import.meta.url).href;
 const script='import('+JSON.stringify(moduleUrl)+').then(m=>{const x=m.recordFailure({project:"Fixture",operation:"test",category:"lock",message:"Cannot append"});console.log(JSON.stringify({logged:x.logged,spooled:x.spooled}));})';
 const result=run(process.execPath,['-e',script],dir,{VALVE_FAILURE_LOG:bad,VALVE_FAILURE_SPOOL:spool});
 assert.equal(result.status,0,result.stderr);
 assert.deepEqual(JSON.parse(result.stdout.trim()),{logged:true,spooled:true});
 assert.equal(readdirSync(spool).length,1);
});
