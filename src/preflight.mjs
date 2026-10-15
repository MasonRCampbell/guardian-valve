import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { recordFailure } from './failure-register.mjs';

const path = resolve(process.env.VALVE_PROJECTS_FILE || 'C:/GuardianControl/Valve/projects.json');
const registry = JSON.parse(readFileSync(path, 'utf8'));
let failed = 0;
for (const p of registry.projects || []) {
  const checks = [];
  const root = resolve(p.path);
  const check = (name, ok, detail) => checks.push({ check: name, ok, ...(detail ? { detail } : {}) });
  check('repository-present', existsSync(root));
  function git(...args) {
    const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 20000, windowsHide: true });
    return { ok: r.status === 0 && !r.error, output: (r.stdout || '').trim() };
  }
  if (existsSync(root)) {
    const repo = git('rev-parse', '--is-inside-work-tree');
    check('git-repository', repo.ok && repo.output === 'true');
    const branch = git('branch', '--show-current');
    check('branch', branch.ok && branch.output === p.branch, branch.output);
    const conflicts = git('ls-files', '-u');
    check('conflicts', conflicts.ok && !conflicts.output);
    const staged = git('diff', '--cached', '--name-only');
    check('staged-files-clear', staged.ok && !staged.output);
    const remote = git('remote', 'get-url', p.remote || 'origin');
    check('remote-configured', remote.ok && Boolean(remote.output));
    const status = git('status', '--porcelain');
    check('git-status-available', status.ok);
    const divergence = git('rev-list', '--left-right', '--count', 'HEAD...refs/remotes/' + (p.remote || 'origin') + '/' + p.branch);
    if (divergence.ok && /^\d+\s+\d+$/.test(divergence.output)) {
      const [ahead, behind] = divergence.output.split(/\s+/).map(Number);
      check('local-remote-in-sync', ahead === 0 && behind === 0, 'ahead=' + ahead + ', behind=' + behind);
    } else {
      check('local-remote-in-sync', false, 'remote tracking unavailable; fetch required');
    }
  }
  const ready = checks.every(c => c.ok);
  if (!ready) {
    failed++;
    for (const c of checks.filter(x => !x.ok)) {
      recordFailure({ project: p.id, operation: 'preflight', category: c.check, message: 'Preflight gate failed' + (c.detail ? ': ' + c.detail : ''), retryable: false });
    }
  }
  console.log(JSON.stringify({ project: p.id, ready, checks }));
}
if (failed) process.exitCode = 1;
