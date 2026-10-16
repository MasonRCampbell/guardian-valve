import {test} from 'node:test';
import assert from 'node:assert/strict';
import {retryDecision} from '../src/retry-policy.mjs';
test('retry policy uses bounded exponential backoff',()=>{
 const t=Date.parse('2026-10-17T00:00:00Z');
 assert.deepEqual(retryDecision(null,t),{action:'attempt',attempts:1,nextRetryAt:'2026-10-17T00:01:00.000Z'});
 const second=retryDecision({status:'pending',attempts:1,nextRetryAt:'2026-10-17T00:01:00.000Z'},t+60000);
 assert.equal(second.attempts,2);
 assert.equal(Date.parse(second.nextRetryAt)-t,180000);
 assert.equal(retryDecision({status:'pending',attempts:2,nextRetryAt:second.nextRetryAt},t+61000).action,'wait');
 assert.equal(retryDecision({status:'pending',attempts:5},t).action,'exhausted');
});
