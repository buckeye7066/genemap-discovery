import {authenticate} from '../middleware/auth.js';
import {ownerSubscription} from '../lib/ownerSubscription.js';
export function isOwnerWorkerRequest(request) {
  return request.method==='POST'&&['/api/owner-ai/worker/poll','/api/owner-ai/worker/result'].includes(String(request.url||'').split('?')[0])&&
    ownerSubscription.authorized(request.headers?.authorization);
}
export default async function ownerSubscriptionRoutes(app) {
  app.addHook('onRequest',(_request,reply,done)=>{reply.header('Cache-Control','no-store');done();});
  app.get('/status',{preHandler:authenticate},async(request,reply)=>{
    if(!ownerSubscription.isOwner())return reply.code(403).send({error:'Owner access required'});
    return ownerSubscription.status();
  });
  const workerAuth=async(request,reply)=>{
    if(!isOwnerWorkerRequest(request))return reply.code(401).send({error:'unauthorized'});
  };
  app.post('/worker/poll',{preHandler:workerAuth},async(request)=>ownerSubscription.poll(request.body));
  app.post('/worker/result',{preHandler:workerAuth},async(request,reply)=>reply.code(ownerSubscription.result(request.body)?200:409).send({received:true}));
}
