export function retryDecision(previous,now=Date.now(),limits={maxAttempts:5,baseDelayMs:60000,maxDelayMs:900000}){
 const attempts=Number.isInteger(previous?.attempts)?previous.attempts:0;
 if(previous?.status==='exhausted'||attempts>=limits.maxAttempts)return {action:'exhausted',attempts};
 const next=Date.parse(previous?.nextRetryAt||'');
 if(previous?.status==='pending'&&Number.isFinite(next)&&now<next)return {action:'wait',attempts,nextRetryAt:previous.nextRetryAt};
 const count=attempts+1;
 const delay=Math.min(limits.maxDelayMs,limits.baseDelayMs*2**(count-1));
 return {action:'attempt',attempts:count,nextRetryAt:new Date(now+delay).toISOString()};
}
