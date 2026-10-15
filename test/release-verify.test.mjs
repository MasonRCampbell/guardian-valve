import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";

const verify=join(dirname(fileURLToPath(import.meta.url)),"..","src","release-verify.mjs");
function git(dir,...args){
 const r=spawnSync("git",args,{cwd:dir,encoding:"utf8",windowsHide:true});
 assert.equal(r.status,0,r.stderr);return r.stdout.trim();
}
test("forged Supabase migration list never counts as deployment proof",()=>{
 const root=mkdtempSync(join(tmpdir(),"valve-verify-"));
 const bare=join(root,"origin.git"),work=join(root,"work");
 mkdirSync(work);
 git(root,"init","--bare",bare);
 git(work,"init","-b","main");git(work,"config","user.name","Valve Test");git(work,"config","user.email","valve-test@example.invalid");
 git(work,"remote","add","origin",bare);
 writeFileSync(join(work,"a.txt"),"abc");
 git(work,"add","a.txt");git(work,"commit","-m","test");
 git(work,"push","-u","origin","main");
 const sha=git(work,"rev-parse","HEAD");
 const payload={project:"Test",repository:work,branch:"main",sha,deployments:[
  {type:"supabase-migration-proof",name:"DB",projectRef:"ijhkxycwwmbmracgwykx",
    expectedMigrationIds:["20261015150000"],verifiedMigrationIds:["20261015150000"]}
 ]};
 const config=join(root,"proof-request.json");writeFileSync(config,JSON.stringify(payload));
 const proofs=join(root,"proofs");const logs=join(root,"failures.jsonl");
 const {SUPABASE_ACCESS_TOKEN:unused,...safeEnv}=process.env;
 const r=spawnSync(process.execPath,[verify,config],{cwd:root,encoding:"utf8",
  env:{...safeEnv,VALVE_RELEASE_PROOFS:proofs,VALVE_FAILURE_LOG:logs},windowsHide:true});
 assert.equal(r.status,1,"A claim without live Supabase access must fail");
 assert.match(r.stderr,/Supabase token unavailable/);
 assert.equal(existsSync(join(proofs,"Test-"+sha.slice(0,12)+".json")),false);
});
