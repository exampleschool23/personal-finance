import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const id=n=>`67000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function route(path){let owner=true,fail=false;const calls=[];const api=loadTS(path,{'@/lib/supabase':{session:async()=>owner?{token:'owner-token'}:null,sameOrigin:r=>r.headers.get('origin')==='https://local',supa:async(path,init,token)=>{calls.push({path,body:init.body?JSON.parse(init.body):null,token});return fail?Response.json({code:'P0001',message:'Changed. Reload.'},{status:409}):Response.json(path.includes('account_statement')?{entries:[],fingerprint:'a'.repeat(64)}:path.includes('reconciliations?')?[]:{ok:true});}}});return {...api,calls,setOwner:v=>owner=v,setFail:v=>fail=v};}
const request=(body,origin='https://local')=>new Request('https://local',{method:'POST',headers:{origin},body:JSON.stringify(body)});
test('reconciliation rejects anonymous, cross-origin and malformed writes; stale state stays an error',async()=>{
 const r=route('app/api/reconciliation/route.ts');const input={id:id(1),account_id:id(2),start_date:'2026-09-01',end_date:'2026-09-24',opening_balance:100,closing_balance:100,cleared:[],fingerprint:'a'.repeat(64),status:'reconciled'};
 assert.equal((await r.POST(request(input,'https://evil'))).status,403);r.setOwner(false);assert.equal((await r.POST(request(input))).status,401);r.setOwner(true);
 for(const patch of [{start_date:'2026-02-30'},{closing_balance:null},{fingerprint:'fake'},{status:'anything'}])assert.equal((await r.POST(request({...input,...patch}))).status,400);
 assert.equal(r.calls.length,0);assert.equal((await r.POST(request(input))).status,200);assert.equal(r.calls[0].token,'owner-token');assert.deepEqual(r.calls[0].body,{p_data:input});
 r.setFail(true);assert.equal((await r.POST(request(input))).status,409);
});
test('investment event API keeps validation and authorization ahead of financial writes',async()=>{
 const r=route('app/api/corporate-events/route.ts');const input={id:id(1),record_id:id(2),target_id:id(3),revision:1,target_revision:1,kind:'dividend',date:'2026-09-24',gross:10,withholding:2,reinvest_amount:5,quantity:.05,numerator:0,denominator:0,notes:''};
 assert.equal((await r.POST(request(input,'https://evil'))).status,403);r.setOwner(false);assert.equal((await r.POST(request(input))).status,401);r.setOwner(true);
 for(const patch of [{gross:null},{withholding:11},{reinvest_amount:9},{quantity:0},{date:'2026-02-30'},{revision:0}])assert.equal((await r.POST(request({...input,...patch}))).status,400);
 assert.equal(r.calls.length,0);assert.equal((await r.POST(request(input))).status,200);assert.equal(r.calls[0].token,'owner-token');assert.deepEqual(r.calls[0].body,{p_data:input});r.setFail(true);assert.equal((await r.POST(request(input))).status,409);
});
