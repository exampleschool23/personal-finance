import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const owner='59000000-0000-4000-8000-000000000001';
test('backup preview and restore require ownership, origin, explicit confirmation, and an exact opaque backup',async()=>{
 let authenticated=true,code=null;const calls=[];
 const {POST,GET}=loadTS('app/api/backup/route.ts',{'@/lib/supabase':{session:async()=>authenticated?{token:'owner-token'}:null,sameOrigin:req=>req.headers.get('origin')==='https://local',supa:async(path,init,token)=>{calls.push({path,body:JSON.parse(init.body),token});if(code)return Response.json({code,message:'Your workspace changed. Preview the backup again before restoring.'},{status:400});return new Response('{"version":2,"amount":0.123456789123456789}',{headers:{'Content-Type':'application/json'}});}}});
 const backup='{"version":2,"amount":0.123456789123456789}';
 const request=(data,origin='https://local')=>new Request('https://local/api/backup',{method:'POST',headers:{origin},body:typeof data==='string'?data:JSON.stringify(data)});
 assert.equal((await POST(request({action:'preview',backup},'https://elsewhere'))).status,403);
 authenticated=false;assert.equal((await POST(request({action:'preview',backup}))).status,401);authenticated=true;
 assert.equal((await POST(request('bad-json'))).status,400);
 assert.equal((await POST(request({action:'restore',backup}))).status,400);assert.equal(calls.length,0);
 assert.equal((await POST(request({action:'preview',backup}))).status,200);assert.equal(calls[0].body.p_backup,backup);assert.equal(calls[0].token,'owner-token');
 assert.equal((await POST(request({action:'restore',backup,confirmed:true,expected_state:'a'.repeat(64)}))).status,200);assert.match(calls[1].path,/restore_finance_backup$/);assert.equal(calls[1].body.p_expected_state,'a'.repeat(64));
 const exported=await GET(new Request('https://local/api/backup'));assert.equal(await exported.text(),backup);
 code='PGRST202';assert.equal((await POST(request({action:'preview',backup}))).status,503);
 code='P0001';assert.equal((await POST(request({action:'restore',backup,confirmed:true,expected_state:'b'.repeat(64)}))).status,409);
});
test('record history is paginated through the caller token and validates identifiers before reads',async()=>{
 const calls=[];
 const {GET}=loadTS('app/api/record-history/route.ts',{'@/lib/supabase':{session:async()=>({token:'owner-token'}),supa:async(path,init,token)=>{calls.push({path,token});return Response.json(Array.from({length:21},(_,id)=>({id})));}}});
 assert.equal((await GET(new Request('https://local?id=bad'))).status,400);assert.equal(calls.length,0);
 const response=await GET(new Request('https://local?id='+owner+'&page=3'));const result=await response.json();assert.equal(result.items.length,20);assert.equal(result.hasMore,true);
 assert.equal(calls[0].token,'owner-token');assert.match(calls[0].path,/offset=40/);assert.match(calls[0].path,/limit=21/);
});
test('database readiness distinguishes missing migrations, network failure and compatible schema',async()=>{
 let response=()=>Response.json({schema_version:59,record_revisions:true,verified_restore:true});
 const {GET}=loadTS('app/api/database-status/route.ts',{'@/lib/supabase':{session:async()=>({token:'owner'}),supa:async()=>response()}});
 assert.equal((await GET()).status,200);
 response=()=>Response.json({code:'PGRST202'},{status:404});assert.match((await (await GET()).json()).error,/migrations/);
 response=()=>{throw Error('network');};assert.match((await (await GET()).json()).error,/Could not check/);
});
test('large owner reads traverse every batch and keep owner authorization on every request',async()=>{
 let calls=0;
 const {readOwnerRows}=loadTS('lib/server-records.ts',{'@/lib/supabase':{supa:async(path,init,token)=>{assert.equal(token,'owner');const query=new URL('https://local'+path).searchParams;const offset=Number(query.get('offset'));calls++;return Response.json(Array.from({length:Math.min(500,25017-offset)},(_,index)=>({id:offset+index})));}}});
 const rows=await readOwnerRows('finance_records','owner');assert.equal(rows.length,25017);assert.equal(new Set(rows.map(row=>row.id)).size,25017);assert.equal(calls,51);
});
test('workspace planning omits unused history while review retains financial activity',async()=>{
 let tables=[];
 const {GET}=loadTS('app/api/planning/route.ts',{'@/lib/supabase':{session:async()=>({token:'owner'})},'@/lib/server-records':{readOwnerRows:async(table,token)=>{assert.equal(token,'owner');tables.push(table);return [];}},'@/lib/deposit-forecasts':{depositForecasts:async()=>[]}});
 assert.equal((await GET(new Request('https://local?scope=workspace'))).status,200);assert.ok(!tables.includes('account_activity'));assert.ok(!tables.includes('asset_movements'));assert.ok(!tables.includes('investment_account_links'));
 tables=[];await GET(new Request('https://local?scope=review'));assert.ok(tables.includes('account_activity'));assert.ok(tables.includes('investment_account_links'));assert.ok(!tables.includes('asset_movements'));
 tables=[];assert.equal((await GET(new Request('https://local?scope=invalid'))).status,400);assert.deepEqual(tables,[]);
});
test('recovery copies remain discoverable through owner-scoped bounded pages',async()=>{
 const calls=[];
 const {GET}=loadTS('app/api/backup/route.ts',{'@/lib/supabase':{session:async()=>({token:'owner'}),supa:async(path,init,token)=>{calls.push({path,token});return Response.json(Array.from({length:21},(_,id)=>({id,created_at:'2026-09-22T00:00:00Z'})));}}});
 const response=await GET(new Request('https://local?recoveries=1&page=2'));const result=await response.json();assert.equal(result.items.length,20);assert.equal(result.hasMore,true);assert.equal(calls[0].token,'owner');assert.match(calls[0].path,/select=id%2Ccreated_at/);assert.match(calls[0].path,/offset=20/);
 assert.equal((await GET(new Request('https://local?recoveries=1&page=-1'))).status,400);
});
