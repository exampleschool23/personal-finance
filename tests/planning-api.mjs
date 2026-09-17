import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {z} from 'zod';
import {timingSafeEqual} from 'node:crypto';
const compile=path=>ts.transpileModule(fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const id='10000000-0000-4000-8000-000000000001';
const req=(body,origin='https://local')=>new Request('https://local',{method:'POST',headers:{origin},body:JSON.stringify(body)});
test('planning API rejects anonymous, cross-origin and malformed operations and ignores forged ownership',async()=>{
 let authenticated=true,calls=[];
 const api=new Function('z','session','supa','sameOrigin','readOwnerRows',compile('app/api/planning/route.ts')+';return {GET,POST};')(z,async()=>authenticated?{token:'owner'}:null,async(path,init,token)=>{calls.push({path,body:JSON.parse(init.body),token});return Response.json({ok:true});},r=>r.headers.get('origin')==='https://local',async()=>[]);
 authenticated=false;assert.equal((await api.GET()).status,401);assert.equal((await api.POST(req({}))).status,401);authenticated=true;
 assert.equal((await api.POST(req({},'https://elsewhere'))).status,403);
 for(const body of [{action:'unknown',data:{}},{action:'transfer',data:{id}},{action:'goal',data:{id,name:'Goal',account_id:id,target:10,allocated:11,target_date:null}},{action:'category',data:{id,name:''}}])assert.equal((await api.POST(req(body))).status,400);
 assert.equal(calls.length,0);assert.equal((await api.POST(req({action:'category',data:{id,name:'Travel',user_id:'attacker'}}))).status,200);assert.deepEqual(calls[0].body,{p_action:'category',p_data:{id,name:'Travel'}});assert.equal(calls[0].token,'owner');
});
test('statement import produces stable distinct duplicate keys and authenticates before any write',async()=>{
 let calls=[];
 const api=new Function('z','session','supa','sameOrigin',compile('app/api/import/route.ts')+';return POST;')(z,async()=>({token:'owner'}),async(path,init,token)=>{calls.push({body:JSON.parse(init.body),token});return Response.json({added:2,skipped:0});},r=>r.headers.get('origin')==='https://local');
 const row={name:'Shop',amount:-20,date:'2026-09-01',notes:''};const data={account_id:id,rows:[row,row]};
 assert.equal((await api(req(data))).status,200);assert.equal((await api(req(data))).status,200);const keys=calls[0].body.p_rows.map(r=>r.key);assert.notEqual(keys[0],keys[1]);assert.deepEqual(keys,calls[1].body.p_rows.map(r=>r.key));assert.equal(calls[0].token,'owner');
 assert.equal((await api(req({...data,rows:[{...row,date:'2026-02-30'}]}))).status,400);
 assert.equal((await api(req(data,'https://elsewhere'))).status,403);
});
test('background capture refuses missing or invalid secret before accessing service credentials',async()=>{
 const before=process.env.CRON_SECRET;
 const api=new Function('timingSafeEqual','loadMarket','instrumentFor','snapshotTotals','depositToday',compile('app/api/cron/portfolio-snapshots/route.ts')+';return GET;')(timingSafeEqual,()=>{throw Error('unexpected');},()=>null,()=>null,()=> '2026-09-17');
 try{delete process.env.CRON_SECRET;assert.equal((await api(new Request('https://local'))).status,401);process.env.CRON_SECRET='test-only-secret';assert.equal((await api(new Request('https://local',{headers:{authorization:'Bearer nope'}}))).status,401);}finally{if(before===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=before;}
});
test('backup uses one owner-scoped database snapshot and fails closed on incomplete reads',async()=>{
 let fail=false,calls=[];
 const api=new Function('session','supa','readOwnerRows','exportCSV',compile('app/api/backup/route.ts')+';return GET;')(async()=>({token:'owner'}),async(path,init,token)=>{calls.push({path,token});return fail?Response.json({error:'offline'},{status:503}):Response.json({version:1,tables:{finance_records:[]}});},async()=>[],()=> 'csv');
 let response=await api(new Request('https://local'));assert.equal(response.status,200);assert.equal((await response.json()).version,1);assert.deepEqual(calls,[{path:'/rest/v1/rpc/export_finance_backup',token:'owner'}]);
 fail=true;response=await api(new Request('https://local'));assert.equal(response.status,503);assert.equal((await response.json()).tables,undefined);
});
