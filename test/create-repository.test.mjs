import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bootstrapRepository,validateSlug} from '../src/create-repository.mjs';
test('validates repository names and private-by-default policy',async()=>{
 assert.equal(validateSlug('australian-data-registry'),'australian-data-registry');
 assert.throws(()=>validateSlug('../bad'),/Invalid repository name/);
 await assert.rejects(()=>bootstrapRepository({name:'some-project',privateRepo:false,dryRun:true}),/private repositories/);
 const d=await bootstrapRepository({name:'some-project',dryRun:true});
 assert.equal(d.status,'DRY_RUN');
});
test('idempotent creation does not issue POST if the repository exists',async()=>{
 let requests=[];
 const fake=async(url,opt)=>{requests.push([url,opt.method||'GET']); return {ok:true,json:async()=>({private:true})};};
 const r=await bootstrapRepository({name:'some-project',token:'test-only',fetchImpl:fake});
 assert.equal(r.status,'EXISTS');
 assert.deepEqual(requests.map(x=>x[1]),['GET']);
});
test('new repositories are created privately with no automatic files',async()=>{
 const requests=[];
 const fake=async(url,opt)=>{
  requests.push([url,opt.method||'GET',opt.body]);
  if(!opt.method)return {status:404,ok:false};
  return {ok:true,json:async()=>({full_name:'MasonRCampbell/new-project',private:true,clone_url:'https://github.com/MasonRCampbell/new-project.git'})};
 };
 const r=await bootstrapRepository({name:'new-project',token:'test-only',fetchImpl:fake});
 assert.equal(r.status,'CREATED');
 assert.equal(JSON.parse(requests[1][2]).auto_init,false);
 assert.equal(JSON.parse(requests[1][2]).private,true);
});
