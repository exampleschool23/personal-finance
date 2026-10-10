import { apiFunction } from './helpers/api-function.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { z } from 'zod';
import { marketEntry } from '../lib/market.ts';
const source=fs.readFileSync('app/api/mortgage-payments/route.ts','utf8').replace(/^import .*;\n/gm,'').replace(/export async function/g,'async function');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
let authenticated=true, calls=[], failure=null;
const api=apiFunction('z','session','supa','sameOrigin','queueMilestoneCheck',js+';return {POST};')(z,async()=>authenticated?{token:'owner-token'}:null,async(path,init,token)=>{calls.push({path,init,token});return failure?Response.json(failure,{status:400}):Response.json({ok:true});},req=>req.headers.get('origin')==='https://app.local',()=>{});
const body={id:'10000000-0000-4000-8000-000000000001',mortgage_id:'10000000-0000-4000-8000-000000000002',principal:506.79,interest:1062.31,date:'2025-11-05',notes:''};
const request=data=>new Request('https://app.local/api/mortgage-payments',{method:'POST',headers:{origin:'https://app.local','Content-Type':'application/json'},body:JSON.stringify(data)});
test('submits one atomic RPC under the signed-in user token',async()=>{
 calls=[];assert.equal((await api.POST(request({...body,account_id:'10000000-0000-4000-8000-000000000003'}))).status,200);
 assert.equal(calls.length,1);assert.equal(calls[0].token,'owner-token');
 assert.equal(calls[0].path,'/rest/v1/rpc/planning_action');
 assert.equal(JSON.parse(calls[0].init.body).p_data.amount,506.79);
});
test('rejects empty, negative, invalid dates, oversized and unauthenticated payments',async()=>{
 for(const patch of [{principal:0,interest:0},{principal:-1},{interest:-1},{date:'2026-02-30'},{id:'bad'},{principal:1e15,interest:1}])assert.equal((await api.POST(request({...body,...patch}))).status,400);
 authenticated=false;assert.equal((await api.POST(request(body))).status,401);authenticated=true;
 assert.equal((await api.POST(new Request('https://app.local',{method:'POST',headers:{origin:'https://other.local'}}))).status,403);
});
test('a refusal the database explains answers 409 in its words, an unknown failure hides its details, a missing function answers 503',async()=>{
 try{
  failure={code:'P0001',message:'Principal exceeds the outstanding balance.'};let response=await api.POST(request({...body,account_id:'10000000-0000-4000-8000-000000000003'}));
  assert.equal(response.status,409);assert.equal((await response.json()).error,'Principal exceeds the outstanding balance.');
  failure={code:'23514',message:'secret row detail'};response=await api.POST(request({...body,account_id:'10000000-0000-4000-8000-000000000003'}));
  assert.equal(response.status,409);assert.ok(!JSON.stringify(await response.json()).includes('secret'));
  failure={code:'PGRST202',message:'Could not find the function'};response=await api.POST(request({...body,account_id:'10000000-0000-4000-8000-000000000003'}));
  assert.equal(response.status,503);assert.match((await response.json()).error,/needs an update/);
 }finally{failure=null;}
});
test('payment breakdown follows display currency conversion',()=>{
 const converted=marketEntry({kind:'Other expense',currency:'USD',amount:1569.10,cost:0,payment_principal:506.79,payment_interest:1062.31},'UZS',{fx:{rate:12000},quotes:{}});
 assert.equal(converted.payment_principal,506.79*12000);assert.equal(converted.payment_interest,1062.31*12000);
});
