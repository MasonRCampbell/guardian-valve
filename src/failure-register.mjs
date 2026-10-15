import { mkdirSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const store = resolve(process.env.VALVE_FAILURE_LOG || 'C:/ProgramData/ValvePipeline/failures.jsonl');
export function recordFailure(event) {
  if (!event || typeof event !== 'object') throw new Error('Event required');
  const message = String(event.message || 'Unknown error').slice(0, 4000)
    .replace(/(gh[psuzr]_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{12,}|Bearer\s+\S+)/gi, '[REDACTED]');
  const row = {
    timestamp: new Date().toISOString(),
    project: String(event.project || 'unknown').slice(0, 100),
    operation: String(event.operation || 'unknown').slice(0, 100),
    category: String(event.category || 'unknown').slice(0, 60),
    message,
    commit: event.commit || null,
    retryable: Boolean(event.retryable),
    status: 'open'
  };
  row.fingerprint = createHash('sha256').update(
    [row.project, row.operation, row.category, row.message.replace(/\d{4}-\d\d-\d\dT\S+/g, '<timestamp>')].join('|')
  ).digest('hex').slice(0, 24);
  mkdirSync(dirname(store), { recursive: true });
  appendFileSync(store, JSON.stringify(row) + '\n', { encoding: 'utf8', mode: 0o600 });
  return row;
}
export function listFailures(limit = 100) {
  if (!existsSync(store)) return [];
  return readFileSync(store, 'utf8').split('\n').filter(Boolean).slice(-limit).map(JSON.parse);
}

