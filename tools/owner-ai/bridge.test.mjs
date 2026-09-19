import test from 'node:test'
import assert from 'node:assert/strict'
import {deliverResult} from './bridge.mjs'
test('a transient delivery error retries the same completed result without new inference',async()=>{
 let time=0;const bodies=[];const body={id:'job',lease:'lease',result:{raw:'complete'}}
 const post=async(route,value)=>{assert.equal(route,'result');bodies.push(value);if(bodies.length===1)throw new Error('temporary');return {received:true}}
 assert.equal(await deliverResult(post,body,{deadline:1000,now:()=>time,wait:async ms=>{time+=ms}}),true)
 assert.equal(bodies.length,2);assert.equal(bodies[0],bodies[1])
})
test('expired and revoked result deliveries stop without an unbounded retry loop',async()=>{
 let count=0;const post=async()=>{count++;throw Object.assign(new Error('revoked'),{status:409})}
 assert.equal(await deliverResult(post,{},{deadline:1000,now:()=>0}),false);assert.equal(count,1)
 assert.equal(await deliverResult(post,{},{deadline:0,now:()=>1}),false);assert.equal(count,1)
})
