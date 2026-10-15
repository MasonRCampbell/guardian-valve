import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'valve-log-'));

test('failure events persist and redact bearer tokens', () => {
  const script = "import {recordFailure,listFailures} from '../src/failure-register.mjs'; recordFailure({project:'SitRep',operation:'push',message:'Bearer secret-example-token'}); if(listFailures().length!==1)process.exit(4);";
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: moduleDir,
    encoding: 'utf8',
    env: {...process.env, VALVE_FAILURE_LOG: join(dir, 'errors.jsonl')}
  });
  assert.equal(r.status, 0, r.stderr);
  const row = JSON.parse(readFileSync(join(dir, 'errors.jsonl'), 'utf8').trim());
  assert.equal(row.project, 'SitRep');
  assert.match(row.message, /\[REDACTED\]/);
  assert.equal(row.status, 'open');
  assert.equal(row.fingerprint.length, 24);
});

test('pipeline refuses a missing release manifest', () => {
  const r = spawnSync(process.execPath, [join(moduleDir, '..', 'src', 'commit-pipeline.mjs')], {
    cwd: moduleDir,
    encoding: 'utf8',
    env: {...process.env, VALVE_RELEASE_MANIFEST: ''}
  });
  assert.equal(r.status, 2);
});
