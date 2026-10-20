import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { recordFailure } from './failure-register.mjs';

// Development checkouts are normal and MUST NOT be mistaken for failed releases.
// A signed release still has to satisfy the strict checks in commit-pipeline.mjs.
const registryPath = resolve(process.env.VALVE_PROJECTS_FILE || 'C:/GuardianControl/Valve/projects.json');
const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
let actualFailures = 0;
function git(root, ...args) {
  const r = spawnSync('git', args, { cwd:root, encoding:'utf8', timeout:20000, windowsHide:true });
  return { ok:r.status === 0 && !r.error, output:(r.stdout || '').trim(), error:(r.stderr || r.error?.message || '').trim() };
}
function inspect(p) {
  const root = resolve(p.path);
  const checks = [];
  const check = (name, ok, detail, severity='error') => checks.push({check:name, ok, severity, ...(detail ? {detail}: {})});
  const present = existsSync(root);
  check('repository-present', present);
  if (!present) return { project:p.id, ready:false, status:'blocked', checks };
  const repo = git(root,'rev-parse','--is-inside-work-tree');
  check('git-repository', repo.ok && repo.output === 'true');
  if (!repo.ok || repo.output !== 'true') return {project:p.id,ready:false,status:'blocked',checks};
  const branch = git(root,'branch','--show-current');
  const actualBranch = branch.output;
  const development = branch.ok && actualBranch !== p.branch && Boolean(actualBranch);
  check('branch-readable', branch.ok && Boolean(actualBranch));
  check('release-branch', branch.ok && actualBranch === p.branch, actualBranch, 'informational');
  const conflicts = git(root,'ls-files','-u');
  check('conflicts', conflicts.ok && !conflicts.output);
  const staged = git(root,'diff','--cached','--name-only');
  check('staged-files-clear', staged.ok && !staged.output, staged.output ? 'Existing staged changes must not be mixed with a signed release' : '', development ? 'informational':'error');
  const remote = git(root,'remote','get-url',p.remote || 'origin');
  check('remote-configured',remote.ok && Boolean(remote.output));
  const status = git(root,'status','--porcelain');
  check('git-status-available',status.ok);
  // Compare the working checkout only with its OWN remote-tracking branch.
  // Comparing feature HEAD to origin/main falsely reported nine unpublished commits.
  const tracking = branch.ok && actualBranch ? git(root,'rev-list','--left-right','--count','HEAD...refs/remotes/'+(p.remote||'origin')+'/'+actualBranch) : {ok:false,output:''};
  const numbers = tracking.ok ? tracking.output.split(/\s+/).map(Number) : [];
  const divergenceKnown = numbers.length === 2 && numbers.every(Number.isFinite);
  const ahead = divergenceKnown ? numbers[0] : null;
  const behind = divergenceKnown ? numbers[1] : null;
  check('tracking-branch-available', divergenceKnown, divergenceKnown ? 'ahead='+ahead+', behind='+behind : 'Fetch or publish the current branch', development ? 'informational':'error');
  if (!development) check('local-remote-in-sync', divergenceKnown && ahead === 0 && behind === 0, divergenceKnown ? 'ahead='+ahead+', behind='+behind : 'Tracking unavailable');
  const failed = checks.filter(c => !c.ok && c.severity !== 'informational');
  const result = { project:p.id, ready:failed.length === 0 && !development, status:failed.length ? 'blocked' : development ? 'development-checkout' : 'release-ready', checkoutBranch:actualBranch, releaseBranch:p.branch, ahead, behind, changedFiles:status.ok ? status.output.split(/\r?\n/).filter(Boolean).length : null, checks };
  if (failed.length) {
    actualFailures++;
    for (const c of failed) recordFailure({project:p.id,operation:'preflight',category:c.check,message:'Preflight gate failed'+(c.detail?': '+c.detail:''),retryable:false});
  }
  return result;
}
if (!Array.isArray(registry.projects)) throw Error('Invalid project registry');
for (const project of registry.projects) console.log(JSON.stringify(inspect(project)));
if (actualFailures) process.exitCode = 1;
