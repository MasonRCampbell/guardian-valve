import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const preflight = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "preflight.mjs");
const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, {cwd, encoding:"utf8", windowsHide:true});
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};

test("preflight refuses a dirty-diverged repository without modifying it", () => {
  const dir = mkdtempSync(join(tmpdir(),"valve-preflight-"));
  const work = join(dir,"work"); const bare = join(dir,"origin.git");
  mkdirSync(work);
  run("git",["init","--bare",bare],dir);
  run("git",["init","-b","main"],work);
  run("git",["config","user.name","Valve Test"],work);
  run("git",["config","user.email","valve-test@example.invalid"],work);
  run("git",["remote","add","origin",bare],work);
  writeFileSync(join(work,"file.txt"),"first");
  run("git",["add","file.txt"],work); run("git",["commit","-m","initial"],work);
  run("git",["push","-u","origin","main"],work);
  const registry = join(dir,"projects.json");
  const failure = join(dir,"failures.jsonl");
  writeFileSync(registry,JSON.stringify({projects:[{id:"fixture",path:work,remote:"origin",branch:"main"}]}));
  let r = spawnSync(process.execPath,[preflight],{cwd:dir,encoding:"utf8",
    env:{...process.env,VALVE_PROJECTS_FILE:registry,VALVE_FAILURE_LOG:failure}});
  assert.equal(r.status,0,r.stdout);
  writeFileSync(join(work,"file.txt"),"second");
  run("git",["add","file.txt"],work);run("git",["commit","-m","local-only"],work);
  r = spawnSync(process.execPath,[preflight],{cwd:dir,encoding:"utf8",
    env:{...process.env,VALVE_PROJECTS_FILE:registry,VALVE_FAILURE_LOG:failure}});
  assert.equal(r.status,1);
  const result = JSON.parse(r.stdout.trim());
  assert.ok(result.checks.some(x=>x.check==="local-remote-in-sync" && !x.ok));
  assert.equal(run("git",["status","--porcelain"],work),"");
});
