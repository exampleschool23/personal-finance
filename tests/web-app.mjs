import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';
test('web app manifest offers install icons and service worker caches no private pages or financial writes',async()=>{
 const manifest=loadTS('app/manifest.ts').default();assert.equal(manifest.display,'standalone');for(const icon of manifest.icons)assert.ok(fs.existsSync('public'+icon.src));
 const handlers={},added=[],deleted=[];const offline=new Response('offline');const self={location:{origin:'https://local'},addEventListener:(type,handler)=>handlers[type]=handler,skipWaiting:async()=>{},clients:{claim:async()=>{}}};
 const context={self,caches:{open:async()=>({add:async url=>added.push(url)}),keys:async()=>['hoggish-offline-v0','unrelated'],delete:async key=>deleted.push(key),match:async url=>{assert.equal(url,'/offline.html');return offline;}},fetch:async()=>{throw Error('Offline')},URL,Response};vm.runInNewContext(fs.readFileSync('public/sw.js','utf8'),context);
 await new Promise((resolve,reject)=>handlers.install({waitUntil:promise=>promise.then(resolve,reject)}));assert.deepEqual(added,['/offline.html']);await new Promise((resolve,reject)=>handlers.activate({waitUntil:promise=>promise.then(resolve,reject)}));assert.deepEqual(deleted,['hoggish-offline-v0']);
 let intercepted=false;for(const request of [{url:'https://local/api/records',method:'GET',mode:'cors'},{url:'https://local/api/import',method:'POST',mode:'cors'}])handlers.fetch({request,respondWith:()=>{intercepted=true}});assert.equal(intercepted,false);
 const result=await new Promise(resolve=>handlers.fetch({request:{url:'https://local/',method:'GET',mode:'navigate'},respondWith:promise=>promise.then(resolve)}));assert.equal(result,offline);assert.deepEqual(added,['/offline.html']);
});
