import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const script=join(dirname(fileURLToPath(import.meta.url)),'..','src','register-project.mjs');
function git(root,...args){const r=spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);}
test('registers a GitHub-backed project once without touching repo files',()=>{
 const root=mkdtempSync(join(tmpdir(),'valve-register-')),repo=join(root,'work'),registry=join(root,'registry.json');
 mkdirSync(repo);git(repo,'init','-b','main');
 git(repo,'remote','add','origin','https://github.com/example/example.git');
 const args=[script,'add','Fixture',repo,'main'];
 let r=spawnSync(process.execPath,args,{encoding:'utf8',env:{...process.env,VALVE_PROJECTS_FILE:registry}});
 assert.equal(r.status,0,r.stderr);
 const data=JSON.parse(readFileSync(registry,'utf8'));
 assert.equal(data.projects.length,1);
 assert.equal(data.projects[0].id,'Fixture');
 r=spawnSync(process.execPath,args,{encoding:'utf8',env:{...process.env,VALVE_PROJECTS_FILE:registry}});
 assert.equal(r.status,1);
 assert.equal(JSON.parse(readFileSync(registry,'utf8')).projects.length,1);
});
test('refuses registration without origin remote',()=>{
 const root=mkdtempSync(join(tmpdir(),'valve-noremote-')),registry=join(root,'reg.json');
 git(root,'init','-b','main');
 const r=spawnSync(process.execPath,[script,'add','Fixture',root,'main'],{encoding:'utf8',env:{...process.env,VALVE_PROJECTS_FILE:registry}});
 assert.notEqual(r.status,0);
});
