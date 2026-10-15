import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, openSync, closeSync, unlinkSync, renameSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { recordFailure } from './failure-register.mjs';
import { createHmac, timingSafeEqual } from 'node:crypto';

// Deliberately fail-closed: this process is invoked only for an explicitly approved
// release manifest. It never stages unspecified files or bypasses CI.
const queueFile = process.env.VALVE_RELEASE_MANIFEST;
if (!queueFile) { console.error('VALVE_RELEASE_MANIFEST not set'); process.exit(2); }
const manifestPath = resolve(queueFile);
const lockPath = manifestPath + '.lock';
function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 120000, windowsHide: true });
  if (r.error || r.status !== 0) throw new Error('git ' + args[0] + ': ' + (r.stderr || r.error?.message || 'exit ' + r.status));
  return r.stdout.trim();
}
function run() {
  if (!existsSync(manifestPath)) return console.log('No release manifest');
  const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (m.approved !== true || m.publish !== true) throw new Error('Release not explicitly approved for publication');
  const signingKey = process.env.VALVE_SIGNING_KEY || (existsSync(process.env.VALVE_SIGNING_KEY_FILE || 'C:/ProgramData/ValvePipeline/signing.key') ? readFileSync(process.env.VALVE_SIGNING_KEY_FILE || 'C:/ProgramData/ValvePipeline/signing.key','utf8').trim() : undefined);
  if (!signingKey || signingKey.length < 32) throw new Error('Release signing key unavailable');
  if (typeof m.signature !== 'string' || !/^[a-f0-9]{64}$/i.test(m.signature)) throw new Error('Missing signed approval');
  const {signature,...payload} = m;
  const expectedSignature = createHmac('sha256',signingKey).update(JSON.stringify(payload)).digest();
  if (!timingSafeEqual(expectedSignature,Buffer.from(signature,'hex'))) throw new Error('Release signature invalid');
  if (!Array.isArray(m.paths) || !m.paths.length || m.paths.some(p => typeof p !== 'string' || !p || p.startsWith('-') || p.includes('..') || p.includes('\\'))) throw new Error('Invalid allowlisted paths');
  if (!/^[a-zA-Z0-9/_-]+$/.test(m.branch || '')) throw new Error('Invalid branch name');
  if (!m.project || typeof m.project !== 'string') throw new Error('Project identifier required');
  const registry = JSON.parse(readFileSync(resolve(process.env.VALVE_PROJECTS_FILE || 'C:/GuardianControl/Valve/projects.json'),'utf8'));
  const project = (registry.projects || []).find(p => p.id === m.project);
  if (!project || resolve(project.path) !== resolve(m.repository) || project.branch !== m.branch || project.remote !== 'origin') throw new Error('Manifest does not match registered project policy');
  const cwd = resolve(m.repository);
  if (git(cwd, ['rev-parse', '--is-inside-work-tree']) !== 'true') throw new Error('Not a git repository');
  if (git(cwd, ['branch', '--show-current']) !== m.branch) throw new Error('Unexpected checkout branch');
  if (git(cwd, ['ls-files', '-u'])) throw new Error('Unresolved merge conflicts');
  if (git(cwd, ['diff', '--cached', '--name-only'])) throw new Error('Existing staged changes: refusing to mix releases');
  const changed = git(cwd, ['status', '--porcelain']);
  if (!changed) throw new Error('No local changes available for approved release');
  const expected = new Set(m.paths);
  const pending = changed.split('\n').map(line => line.slice(2).trimStart().replace(/^.* -> /, '')).filter(Boolean);
  if (pending.some(p => !expected.has(p))) throw new Error('Working tree contains unapproved changes; release blocked: ' + JSON.stringify(pending));
  for (const command of (m.checks || [])) {
    if (!Array.isArray(command) || command.length < 1 || command.some(s => typeof s !== 'string')) throw new Error('Invalid validation command');
    const r = spawnSync(command[0], command.slice(1), {cwd, windowsHide:true, encoding:'utf8', timeout:600000, shell:false});
    if (r.status !== 0 || r.error) throw new Error('Validation failed (' + command[0] + '): ' + (r.stderr || r.error?.message || r.status));
  }
  git(cwd, ['fetch', 'origin', m.branch]);
  if (git(cwd, ['rev-parse', 'HEAD']) !== git(cwd, ['rev-parse', 'origin/' + m.branch])) throw new Error('Local branch differs from remote; manual reconciliation required');
  git(cwd, ['add', '--', ...m.paths]);
  const staged = git(cwd, ['diff', '--cached', '--name-only']).split('\n').filter(Boolean);
  if (!staged.length || staged.some(p => !expected.has(p))) throw new Error('Nothing valid staged');
  git(cwd, ['commit', '-m', String(m.message || 'chore: approved release').slice(0, 160)]);
  git(cwd, ['push', 'origin', 'HEAD:refs/heads/' + m.branch]);
  const sha = git(cwd, ['rev-parse', 'HEAD']);
  renameSync(manifestPath, manifestPath + '.submitted-' + sha.slice(0,12));
  console.log(JSON.stringify({status:'pushed',sha,branch:m.branch,ci:'pending'}));
}
let lock;
let projectId = 'unidentified';
try {
  mkdirSync(dirname(lockPath),{recursive:true});
  lock = openSync(lockPath,'wx');
  try { projectId = String(JSON.parse(readFileSync(manifestPath, 'utf8')).project || 'unidentified').slice(0,100); } catch {}
  run();
} catch(e) {
  recordFailure({project:projectId,operation:'approved-commit-pipeline',category:'release-block',message:e.message,retryable:/timeout|network|connect|rate limit/i.test(e.message)});
  console.error(e.message);
  process.exitCode=1;
} finally {
  if (lock !== undefined) {closeSync(lock);unlinkSync(lockPath);}
}
