import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
test('submission is rejected without explicit approval',()=>{
 const d=mkdtempSync(join(tmpdir(),'valve-submit-'));
 const registry=join(d,'projects.json'),request=join(d,'request.json');
 writeFileSync(registry,JSON.stringify({projects:[{id:'Demo',path:d,branch:'main',remote:'origin'}]}));
 writeFileSync(request,JSON.stringify({project:'Demo',approved:false,publish:true,paths:['file.txt']}));
 const result=spawnSync(process.execPath,['src/submit-release.mjs',request],{cwd:new URL('..',import.meta.url).pathname.slice(1),env:{...process.env,VALVE_PROJECTS_FILE:registry,VALVE_QUEUE_DIR:d,VALVE_SIGNING_KEY:'test-key-123456789012345678901234567890'},encoding:'utf8'});
 assert.notEqual(result.status,0);
 assert.equal(readdirSync(d).filter(x=>x.startsWith('release-')).length,0);
});
