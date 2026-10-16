import { verifySitRepProduction } from './production-revision-watch.mjs';
import { watch, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { recordFailure } from './failure-register.mjs';
import { scanGitHub } from './github-ci-watch.mjs';

// Handles explicitly signed and approved manifests only. Never approves or deploys itself.
const dir = resolve(process.env.VALVE_QUEUE_DIR || 'C:/ProgramData/ValvePipeline/approved');
const pipeline = fileURLToPath(new URL('./commit-pipeline.mjs', import.meta.url));
mkdirSync(dir, { recursive: true });
const active = new Set();
const attempted = new Map();
function logFailure(event) {
  try { recordFailure(event); }
  catch (e) { console.error('FAILURE_LOG_UNAVAILABLE', e.message, JSON.stringify(event)); }
}
function dispatch(file) {
  if (!/^release-[a-zA-Z0-9_-]+\.json$/.test(file) || active.has(file)) return;
  const path = resolve(dir, file);
  if (!existsSync(path)) { attempted.delete(file); return; }
  let revision;
  try { const s = statSync(path); revision = s.size + ':' + s.mtimeMs; }
  catch (e) { logFailure({ project:'Valve', operation:'queue-stat', category:'filesystem', message:e.message }); return; }
  if (attempted.get(file) === revision) return;
  attempted.set(file, revision);
  active.add(file);
  let done = false;
  let child;
  try {
    child = spawn(process.execPath, [pipeline], {
      env: { ...process.env, VALVE_RELEASE_MANIFEST:path },
      windowsHide: true, stdio:'ignore'
    });
  } catch (e) {
    logFailure({ project:'Valve', operation:'dispatch', category:'process-start', message:e.message });
    active.delete(file);
    return;
  }
  child.on('error', e => {
    if (done) return;
    done = true;
    logFailure({ project:'Valve', operation:'dispatch', category:'process-start', message:e.message });
    active.delete(file);
  });
  child.on('exit', code => {
    if (done) return;
    done = true;
    if (code !== 0) logFailure({ project:'Valve', operation:'dispatch', category:'pipeline-exit', message:'Release worker exit '+code });
    active.delete(file);
  });
}
function scan() {
  try {
    const files = readdirSync(dir);
    for (const file of files) dispatch(file);
    for (const file of attempted.keys()) if (!files.includes(file)) attempted.delete(file);
  } catch (e) { logFailure({ project:'Valve', operation:'queue-scan', category:'filesystem', message:e.message }); }
}
watch(dir, () => scan());
scan();
console.log('Valve event dispatcher listening: '+dir);

let ciWatchRunning = false;
async function watchCiFailures() {
  if (ciWatchRunning) return;
  ciWatchRunning = true;
  try {
    const result = await scanGitHub();
    console.log('Valve CI watch', JSON.stringify(result));
  } catch (error) {
    logFailure({ project:'Valve', operation:'github-ci-watch', category:'watch-failed', message:error.message, retryable:true });
  } finally { ciWatchRunning = false; }
}
void watchCiFailures();
setInterval(() => { void watchCiFailures(); }, 60000);

async function checkLiveSitRep(){try{await verifySitRepProduction()}catch(e){console.error('SITREP_PRODUCTION_CHECK_FAILED',e.message)}}
void checkLiveSitRep();
setInterval(()=>{void checkLiveSitRep()},300000);
