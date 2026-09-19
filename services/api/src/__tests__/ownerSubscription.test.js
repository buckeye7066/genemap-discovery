import {it as test,vi} from 'vitest';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createOwnerSubscription} from '../lib/ownerSubscription.js';
const env={OWNER_AI_USER_ID:'owner-id',OWNER_AI_EMAIL:'owner@example.test',OWNER_AI_BRIDGE_ENABLED:'true',OWNER_AI_BRIDGE_TOKEN:'x'.repeat(48)};
const result={ok:true,complete:true,provider:'subscription:codex',billing_mode:'subscription',model:'gpt-6-astra',model_source:'app_server_configuration',raw:'Fixture answer',usage:{input_tokens:8,cached_input_tokens:0,output_tokens:3}};
test('only a verified owner identity can queue subscription inference',async()=>{
 const runtime=createOwnerSubscription({env});runtime.poll({providers:{codex:'ready'}});
 await assert.rejects(runtime.complete({prompt:'public',maxTokens:100,timeoutMs:1000}),/owner/i);
 await runtime.scope(new EventEmitter(),async()=>{
  runtime.identify({id:'other',email:'owner@example.test',role:'admin'});
  assert.equal(runtime.isOwner(),false);
  runtime.identify({id:'owner-id',email:'owner@example.test',role:'admin'});
  const answer=runtime.complete({prompt:'fixture',maxTokens:100,timeoutMs:1000});
  const {job}=runtime.poll({providers:{codex:'ready'}});
  assert.ok(job);assert.equal(job.prompt,'fixture');
  assert.equal(runtime.result({id:job.id,lease:'wrong',result}),false);
  assert.equal(runtime.result({id:job.id,lease:job.lease,result}),true);
  assert.equal((await answer).billing_mode,'subscription');
  assert.equal(runtime.result({id:job.id,lease:job.lease,result}),true);
 });
});
test('cancellation revokes pending work without changing owner billing identity',async()=>{
 const runtime=createOwnerSubscription({env});const response=new EventEmitter();runtime.poll({providers:{codex:'ready'}});
 await runtime.scope(response,async()=>{
  runtime.identify({id:'owner-id',email:'owner@example.test',role:'admin'});
  const pending=runtime.complete({prompt:'fixture',maxTokens:100,timeoutMs:1000});response.emit('close');
  await assert.rejects(pending);assert.equal(runtime.isOwner(),true);
  assert.equal(runtime.poll({providers:{codex:'ready'}}).job,null);
 });
});


test('the owner transport does not bypass genomic input safeguards',async()=>{
 const {generateExplanation}=await import('../services/llm.js');
 const {ownerSubscription}=await import('../lib/ownerSubscription.js');
 const old={...process.env};Object.assign(process.env,env);
 try {
  await ownerSubscription.scope(new EventEmitter(),async()=>{
   ownerSubscription.identify({id:'owner-id',email:'owner@example.test',role:'super_admin'});
   await assert.rejects(generateExplanation('##fileformat=VCFv4.2\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\n1\t1234\trs123\tA\tG\t.\tPASS\t.'),/genomic|VCF/i);
  });
 } finally {for(const key of Object.keys(env)){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}}
});


test('verified owner explanations use subscription inference after the scientific guards',async()=>{
 const {generateExplanation}=await import('../services/llm.js');const native=await import('../services/openai.js');
 const {ownerSubscription}=await import('../lib/ownerSubscription.js');const old={...process.env};Object.assign(process.env,env);
 const paid=vi.spyOn(native,'generateTextResult').mockResolvedValue({text:'Paid native output',completion:'complete',model:'fixture'});
 ownerSubscription.poll({providers:{codex:'ready'}});let requestSeen;const pump=setInterval(()=>{
  const {job}=ownerSubscription.poll({providers:{codex:'ready'}});if(job){requestSeen=job;ownerSubscription.result({id:job.id,lease:job.lease,result});}
 },5);
 try {await ownerSubscription.scope(new EventEmitter(),async()=>{
  ownerSubscription.identify({id:'owner-id',email:'owner@example.test',role:'super_admin'});
  const answer=await generateExplanation('Explain Mendelian inheritance for a lesson.',{includeMetadata:true});
  assert.equal(answer.billing_mode,'subscription');assert.equal(answer.text,'Fixture answer');assert.equal(paid.mock.calls.length,0);
  assert.match(requestSeen.system,/research|educat|diagnos|clinical/i);
 });}finally{clearInterval(pump);paid.mockRestore();for(const key of Object.keys(env)){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}}
});


test('owner chat preserves the canonical scientific-honesty system and uses the subscription',async()=>{
 const {generateChatResponse}=await import('../services/llm.js');const {ownerSubscription}=await import('../lib/ownerSubscription.js');const old={...process.env};Object.assign(process.env,env);let seen;
 const pump=setInterval(()=>{const {job}=ownerSubscription.poll({providers:{codex:'ready'}});if(job){seen=job;ownerSubscription.result({id:job.id,lease:job.lease,result});}},5);
 ownerSubscription.poll({providers:{codex:'ready'}});
 try {await ownerSubscription.scope(new EventEmitter(),async()=>{ownerSubscription.identify({id:'owner-id',email:'owner@example.test',role:'super_admin'});const answer=await generateChatResponse([{role:'system',content:'Explain only educational concepts.'},{role:'user',content:'What is a chromosome?'}],{includeMetadata:true});assert.equal(answer.billing_mode,'subscription');assert.match(seen.system,/scientific-honesty/);assert.match(seen.system,/Never fabricate/);assert.doesNotMatch(seen.system,/Explain only educational concepts/);});}
 finally{clearInterval(pump);for(const key of Object.keys(env)){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}}
});
