import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {githubRepo,scanGitHub} from '../src/github-ci-watch.mjs';
function git(cwd,...args){const r=spawnSync('git',args,{cwd,encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr)}
test('GitHub remote parsing never accepts arbitrary hosts',()=>{
 assert.equal(githubRepo('https://github.com/Owner/repo.git'),'Owner/repo');
 assert.equal(githubRepo('git@github.com:Owner/repo.git'),'Owner/repo');
 assert.equal(githubRepo('https://evil.example/Owner/repo.git'),null);
});
test('CI watcher persists failures exactly once across repeated scans',async()=>{
 const root=mkdtempSync(join(tmpdir(),'valve-watch-'));
 const work=join(root,'work'),statePath=join(root,'seen.json');
 mkdirSync(work);git(work,'init','-b','main');
 git(work,'remote','add','origin','https://github.com/TestOrg/TestRepo.git');
 const projects=[{id:'Demo',path:work,branch:'main',remote:'origin'}];
 const events=[];
 const fetchImpl=async()=>({ok:true,json:async()=>({workflow_runs:[{
  id:123456,name:'CI',status:'completed',conclusion:'failure',head_sha:'1'.repeat(40)
 }]})});
 const opts={token:'unit-test-token',statePath,projects,fetchImpl,recordFailureImpl:x=>events.push(x)};
 const first=await scanGitHub(opts);
 assert.equal(first.failureEvents,1);
 await scanGitHub(opts);
 assert.equal(events.length,1);
 assert.equal(events[0].project,'Demo');
 assert.equal(JSON.parse(readFileSync(statePath,'utf8')).latest.Demo.repo,'TestOrg/TestRepo');
});
