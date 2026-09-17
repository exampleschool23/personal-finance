import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {z} from 'zod';
const source=fs.readFileSync('app/api/deleted-items/route.ts','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
let auth=true,fail=false,calls=[];
const api=new Function('z','session','supa','sameOrigin',js+';return {GET,POST};')(z,async()=>auth?{user:{id:'owner'},token:'owner-token'}:null,async(path,init,token)=>{calls.push({path,init,token});return fail?Response.json({}, {status:409}):Response.json(Array.from({length:11},(_,id)=>({id})));},req=>req.headers.get('origin')==='https://local');
const id='10000000-0000-4000-8000-000000000001';
const request=(body,origin='https://local')=>new Request('https://local',{method:'POST',headers:{origin},body:JSON.stringify(body)});
test('deleted items are read with the owner token and bounded pagination',async()=>{
 calls=[];const response=await api.GET(new Request('https://local?page=2'));const data=await response.json();
 assert.equal(data.items.length,10);assert.equal(data.hasMore,true);assert.match(calls[0].path,/limit=11&offset=10$/);assert.equal(calls[0].token,'owner-token');
 assert.equal((await api.GET(new Request('https://local?page=-1'))).status,400);
});
test('restoration validates input, session and origin before the owner-scoped RPC',async()=>{
 calls=[];assert.equal((await api.POST(request({id}))).status,200);assert.equal(calls[0].path,'/rest/v1/rpc/restore_deleted_item');assert.deepEqual(JSON.parse(calls[0].init.body),{p_id:id});
 calls=[];assert.equal((await api.POST(request({id:'bad'}))).status,400);assert.equal((await api.POST(request({id},'https://other'))).status,403);assert.equal(calls.length,0);
 auth=false;assert.equal((await api.GET(new Request('https://local'))).status,401);assert.equal((await api.POST(request({id}))).status,401);auth=true;
 fail=true;assert.equal((await api.POST(request({id}))).status,409);fail=false;
});
