import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { z } from 'zod';
import { marketEntry } from '../lib/market.ts';
const source=fs.readFileSync('app/api/mortgage-payments/route.ts','utf8').replace(/^import .*;\n/gm,'').replace(/export async function/g,'async function');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
let authenticated=true, calls=[];
const api=new Function('z','session','supa','sameOrigin',js+';return {POST};')(z,async()=>authenticated?{token:'owner-token'}:null,async(path,init,token)=>{calls.push({path,init,token});return Response.json({ok:true});},req=>req.headers.get('origin')==='https://app.local');
const body={id:'10000000-0000-4000-8000-000000000001',mortgage_id:'10000000-0000-4000-8000-000000000002',principal:506.79,interest:1062.31,date:'2025-11-05',notes:''};
const request=data=>new Request('https://app.local/api/mortgage-payments',{method:'POST',headers:{origin:'https://app.local','Content-Type':'application/json'},body:JSON.stringify(data)});
test('submits one atomic RPC under the signed-in user token',async()=>{
 calls=[];assert.equal((await api.POST(request(body))).status,200);
 assert.equal(calls.length,1);assert.equal(calls[0].token,'owner-token');
 assert.equal(calls[0].path,'/rest/v1/rpc/record_mortgage_payment');
 assert.equal(JSON.parse(calls[0].init.body).p_principal,506.79);
});
test('rejects empty, negative, invalid dates, oversized and unauthenticated payments',async()=>{
 for(const patch of [{principal:0,interest:0},{principal:-1},{interest:-1},{date:'2026-02-30'},{id:'bad'},{principal:1e15,interest:1}])assert.equal((await api.POST(request({...body,...patch}))).status,400);
 authenticated=false;assert.equal((await api.POST(request(body))).status,401);authenticated=true;
 assert.equal((await api.POST(new Request('https://app.local',{method:'POST',headers:{origin:'https://other.local'}}))).status,403);
});
test('payment breakdown follows display currency conversion',()=>{
 const converted=marketEntry({kind:'Other expense',currency:'USD',amount:1569.10,cost:0,payment_principal:506.79,payment_interest:1062.31},'UZS',{fx:{rate:12000},quotes:{}});
 assert.equal(converted.payment_principal,506.79*12000);assert.equal(converted.payment_interest,1062.31*12000);
});
