import {AsyncLocalStorage} from 'node:async_hooks';
import {randomBytes,timingSafeEqual} from 'node:crypto';
const failure=message=>Object.assign(new Error(message),{status:503,statusCode:503,code:'OWNER_SUBSCRIPTION_UNAVAILABLE'});

/** Per-service owner bridge. Account credentials never leave the owner's worker. */
export function createOwnerSubscription({env=process.env,now=Date.now}={}) {
  const contexts=new AsyncLocalStorage();const pending=new Map();const acknowledgements=new Map();let worker=null;
  const leaseMs=10000;
  const enabled=()=>env.OWNER_AI_BRIDGE_ENABLED==='true'&&(env.NODE_ENV!=='production'||env.OWNER_AI_API_REPLICAS==='1');
  const owner=identity=>Boolean(env.OWNER_AI_USER_ID&&env.OWNER_AI_EMAIL&&identity?.id===env.OWNER_AI_USER_ID&&
    String(identity?.email||'').toLowerCase()===env.OWNER_AI_EMAIL.toLowerCase()&&['admin','super_admin','owner'].includes(identity?.role));
  const online=()=>enabled()&&worker?.ready&&now()-worker.at<15000;
  function scope(response,work) {
    const controller=new AbortController();const close=()=>controller.abort();
    response?.once?.('close',close);response?.once?.('finish',close);
    return contexts.run({identity:null,signal:controller.signal},work);
  }
  function identify(identity) {const current=contexts.getStore();if(current)current.identity=owner(identity)?{...identity}:null;}
  const isOwner=()=>owner(contexts.getStore()?.identity);
  function authorized(header) {
    const token=env.OWNER_AI_BRIDGE_TOKEN;
    if(typeof token!=='string'||token.length<32||typeof header!=='string'||header.length>1024)return false;
    const expected=Buffer.from('Bearer '+token);const received=Buffer.from(header);
    return expected.length===received.length&&timingSafeEqual(expected,received);
  }
  function status() {return {enabled:enabled(),online:Boolean(online()),pending:pending.size,single_replica_required:true,billing_mode:'subscription',metered_fallback:false};}
  function poll(body={}) {
    worker={at:now(),ready:body.providers?.codex==='ready'};
    for(const [id,ack] of acknowledgements)if(now()>=ack.expires)acknowledgements.delete(id);
    for(const item of pending.values()){
      if(now()>=item.deadline)item.finish(null);
      else if(item.lease&&now()>=item.leaseUntil){if(item.attempts>=2)item.finish(null);else item.lease=null;}
    }
    if(body.active){const item=pending.get(body.active.id);const active=Boolean(item&&item.lease===body.active.lease);if(active)item.leaseUntil=Math.min(item.deadline,now()+leaseMs);return {job:null,active};}
    if(!online())return {job:null};
    const item=[...pending.values()].find(candidate=>!candidate.lease);
    if(!item)return {job:null};
    item.lease=randomBytes(24).toString('hex');item.leaseUntil=Math.min(item.deadline,now()+leaseMs);item.attempts++;
    return {job:{...item.input,id:item.id,lease:item.lease,providers:['codex'],timeoutMs:Math.max(0,item.deadline-now())}};
  }
  function result(body={}) {
    const item=pending.get(body.id);if(!item){const ack=acknowledgements.get(body.id);return Boolean(ack&&ack.lease===body.lease&&now()<ack.expires);}
    if(!item.lease||item.lease!==body.lease||now()>=item.leaseUntil)return false;
    const answer=body.result;let valid=null;
    if(now()<item.deadline&&answer?.ok===true&&answer.complete===true&&answer.provider==='subscription:codex'&&
      answer.billing_mode==='subscription'&&answer.model_source==='app_server_configuration'&&
      typeof answer.model==='string'&&/^[a-zA-Z0-9._:-]{1,120}$/.test(answer.model)&&
      typeof answer.raw==='string'&&answer.raw.trim()&&Buffer.byteLength(answer.raw)<=262144&&
      ['input_tokens','cached_input_tokens','output_tokens'].every(k=>Number.isSafeInteger(answer.usage?.[k])&&answer.usage[k]>=0)&&
      answer.usage.output_tokens>0) {
      valid={ok:true,raw:answer.raw,provider:answer.provider,model:answer.model,billing_mode:'subscription',usage:answer.usage};
      if(item.input.format==='json'){try{const parsed=JSON.parse(answer.raw);if(!parsed||typeof parsed!=='object')valid=null;}catch{valid=null;}}
    }
    item.finish(valid);return true;
  }
  async function complete({prompt,system='',format='text',maxTokens=2000,timeoutMs=30000,signal}={}) {
    const context=contexts.getStore();if(!isOwner())throw failure('Owner subscription requires a verified owner session');
    context.signal.throwIfAborted();signal?.throwIfAborted();
    if(!online()||pending.size>=4)throw failure('Owner subscription worker is offline or busy; no metered fallback was used');
    if(typeof prompt!=='string'||typeof system!=='string'||Buffer.byteLength(prompt+system)>131072||
      !['text','json'].includes(format)||!Number.isInteger(maxTokens)||maxTokens<2||maxTokens>32000||
      !Number.isFinite(timeoutMs)||timeoutMs<=0)throw failure('Unsupported owner subscription request');
    const budget=Math.min(timeoutMs,120000);const id=randomBytes(24).toString('hex');
    return new Promise((resolve,reject)=>{
      const signals=[context.signal,signal].filter(Boolean);let timer;
      const cancel=()=>finish(null);
      const finish=value=>{const old=pending.get(id);if(!pending.delete(id))return;if(old?.lease){acknowledgements.set(id,{lease:old.lease,expires:now()+60000});while(acknowledgements.size>100)acknowledgements.delete(acknowledgements.keys().next().value);}
        clearTimeout(timer);signals.forEach(s=>s.removeEventListener('abort',cancel));
        if(value)resolve(value);else reject(failure('Owner subscription did not complete; no metered fallback was used'));};
      pending.set(id,{id,input:{prompt,system,format,maxTokens},deadline:now()+budget,lease:null,leaseUntil:0,attempts:0,finish});
      timer=setTimeout(cancel,budget);signals.forEach(s=>s.addEventListener('abort',cancel,{once:true}));
      if(signals.some(s=>s.aborted))cancel();
    });
  }
  function openAIClient({timeoutMs=30000,signal}={}) {
    const create=async params=>{
      const messages=params.messages;
      if(!Array.isArray(messages)||params.tools?.length||messages.some(m=>typeof m.content!=='string'))throw failure('Owner text transport cannot perform this native provider operation');
      const system=messages.filter(m=>['system','developer'].includes(m.role)).map(m=>m.content).join('\n\n');
      const answer=await complete({system,prompt:JSON.stringify(messages.filter(m=>!['system','developer'].includes(m.role))),
        format:params.response_format?.type==='json_object'?'json':'text',maxTokens:params.max_tokens??params.max_completion_tokens??2000,timeoutMs,signal});
      const metadata={model:answer.model,provider:answer.provider,billing_mode:answer.billing_mode,usage:answer.usage};
      if(params.stream){const stream=(async function*(){yield {choices:[{delta:{content:answer.raw},finish_reason:null}]};yield {choices:[{delta:{},finish_reason:'stop'}],usage:answer.usage};})();return Object.assign(stream,metadata);}
      return {...metadata,choices:[{message:{role:'assistant',content:answer.raw},finish_reason:'stop'}]};
    };
    return {chat:{completions:{create}},images:{generate:async()=>{throw failure('Image generation is not supported by the owner text subscription bridge');}}};
  }
  return {scope,identify,isOwner,authorized,status,poll,result,complete,openAIClient};
}
export const ownerSubscription=createOwnerSubscription();
