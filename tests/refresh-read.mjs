import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {refreshRead}=loadTS('lib/refresh-read.ts');
test('temporary read failures recover automatically without cached responses or writes',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(url,options)=>{assert.equal(options.method,undefined);assert.equal(options.cache,'no-store');calls++;if(calls===1)throw Error('offline');return Response.json({}, {status:calls===2?503:200});};
 try{assert.equal((await refreshRead('/api/planning',{},[0,0])).status,200);assert.equal(calls,3);}finally{globalThis.fetch=original;}
});
test('permanent errors do not retry and transient retries are bounded',async()=>{
 const original=globalThis.fetch;
 try{for(const status of [401,403,400,503]){let calls=0;globalThis.fetch=async()=>{calls++;return new Response(null,{status});};assert.equal((await refreshRead('/api/records',{},[0,0])).status,status);assert.equal(calls,status===503?3:1);}}finally{globalThis.fetch=original;}
});
test('aborting while waiting prevents stale account retries',async()=>{
 const original=globalThis.fetch;let calls=0;const controller=new AbortController();
 globalThis.fetch=async()=>{calls++;return new Response(null,{status:503});};
 try{const pending=refreshRead('/api/planning',{signal:controller.signal},[10000]);await new Promise(resolve=>setImmediate(resolve));controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
