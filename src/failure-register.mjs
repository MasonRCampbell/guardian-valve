import { mkdirSync, appendFileSync, readFileSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
const store = resolve(process.env.VALVE_FAILURE_LOG || 'C:/ProgramData/ValvePipeline/failures.jsonl');
const spool = resolve(process.env.VALVE_FAILURE_SPOOL || join(dirname(store),'failure-spool'));
const RETRY_CODES = new Set(['EPERM','EACCES','EBUSY','EMFILE']);
const sleeper = new Int32Array(new SharedArrayBuffer(4));
function recentDuplicate(row) {
  if (!existsSync(store)) return false;
  try {
    const records = readFileSync(store,'utf8').trim().split(/\r?\n/).slice(-250);
    for (let i=records.length-1;i>=0;i--) {
      let prior;try{prior=JSON.parse(records[i]);}catch{continue;}
      if (prior.fingerprint === row.fingerprint && Date.now()-Date.parse(prior.timestamp) < 6*3600000) return true;
    }
  }catch{}
  return false;
}
export function recordFailure(event) {
  if (!event || typeof event !== 'object') throw new Error('Event required');
  const message = String(event.message || 'Unknown error').slice(0,4000)
    .replace(/(gh[psuzr]_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{12,}|Bearer\s+\S+)/gi,'[REDACTED]');
  const row = {
    timestamp:new Date().toISOString(),
    project:String(event.project||'unknown').slice(0,100),
    operation:String(event.operation||'unknown').slice(0,100),
    category:String(event.category||'unknown').slice(0,60),
    message,
    commit:event.commit||null,
    retryable:Boolean(event.retryable),
    status:'open'
  };
  row.fingerprint=createHash('sha256').update(
    [row.project,row.operation,row.category,row.message.replace(/\d{4}-\d\d-\d\dT\S+/g,'<timestamp>')].join('|')
  ).digest('hex').slice(0,24);
  if(recentDuplicate(row))return {...row,logged:true,duplicate:true};
  let lastError;
  for(let attempt=0;attempt<4;attempt++) {
    try {
      mkdirSync(dirname(store),{recursive:true});
      appendFileSync(store,JSON.stringify(row)+'\n',{encoding:'utf8',mode:0o600});
      return {...row,logged:true};
    } catch(error) {
      lastError=error;
      if(!RETRY_CODES.has(error?.code))break;
      Atomics.wait(sleeper,0,0,75*(attempt+1));
    }
  }
  // A Windows file lock must never crash the dispatcher or erase the original
  // release failure. Persist a standalone recovery item if append was denied.
  try {
    mkdirSync(spool,{recursive:true});
    const name=Date.now()+'-'+randomUUID()+'.json';
    writeFileSync(join(spool,name),JSON.stringify(row)+'\n',{flag:'wx',mode:0o600});
    console.error('VALVE_FAILURE_SPOOLED '+row.fingerprint+' '+String(lastError?.code||'write-error'));
    return {...row,logged:true,spooled:true};
  } catch(spoolError) {
    console.error('VALVE_FAILURE_LOG_UNAVAILABLE '+JSON.stringify({project:row.project,operation:row.operation,category:row.category,message:row.message,storeError:String(lastError?.code||''),spoolError:String(spoolError?.code||'')}));
    return {...row,logged:false};
  }
}
export function listFailures(limit=100){
  const rows=[];
  if(existsSync(store)){
    try{for(const line of readFileSync(store,'utf8').split(/\r?\n/).filter(Boolean)){try{rows.push(JSON.parse(line))}catch{}}}catch{}
  }
  try{
    if(existsSync(spool))for(const file of readdirSync(spool).filter(x=>/^[\w-]+\.json$/.test(x)).slice(-500)){
      try{rows.push(JSON.parse(readFileSync(join(spool,file),'utf8')))}catch{}
    }
  }catch{}
  return rows.sort((a,b)=>String(a.timestamp||'').localeCompare(String(b.timestamp||''))).slice(-limit);
}
