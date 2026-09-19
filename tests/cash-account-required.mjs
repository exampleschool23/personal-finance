import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {requiresCashAccount}=loadTS('lib/cash-account-required.ts');
const {income,expenses}=loadTS('lib/finance.ts');
test('actual income and expenses require cash accounts, while plans and balances do not',()=>{
 for(const kind of [...income,...expenses]){
  assert.equal(requiresCashAccount({kind,frequency:'Once'}),true);
  for(const frequency of ['Monthly','Yearly'])assert.equal(requiresCashAccount({kind,frequency}),false);
 }
 for(const kind of ['Cash','Deposit','Stock','Business','Property','Debt'])assert.equal(requiresCashAccount({kind,frequency:'Once'}),false);
});
test('record API rejects missing accounts before database writes, including edits',async()=>{
 let calls=0;
 const {POST}=loadTS('app/api/records/route.ts',{'@/lib/supabase':{session:async()=>({token:'owner',user:{id:'owner'}}),sameOrigin:()=>true,supa:async()=>{calls++;return Response.json([]);}}});
 const record={id:'53000000-0000-4000-8000-000000000001',name:'Payment',kind:'Other income',currency:'USD',amount:400.125,quantity:1,cost:0,rate:0,date:'2026-09-18',frequency:'Once',notes:''};
 for(const kind of ['Other income','Salary','Rent income','Other expense'])for(const account_id of [null,undefined]){
  const result=await POST(new Request('https://local/api/records',{method:'POST',body:JSON.stringify({...record,kind,account_id})}));
  assert.equal(result.status,400);assert.equal((await result.json()).error,'Choose a cash account.');
 }
 assert.equal(calls,0);
 const plan=await POST(new Request('https://local/api/records',{method:'POST',body:JSON.stringify({...record,frequency:'Monthly'})}));
 assert.equal(plan.status,200);assert.equal(calls,1);
});

test('all tracker cash actions require an account; valuations remain cash-free',async()=>{
 const calls=[];
 const {POST}=loadTS('app/api/investment-history/route.ts',{'@/lib/supabase':{session:async()=>({token:'owner'}),sameOrigin:()=>true,supa:async(path,init,token)=>{calls.push({path,payload:JSON.parse(init.body),token});return Response.json({ok:true});}}});
 const base={id:'53000000-0000-4000-8000-000000000001',record_id:'53000000-0000-4000-8000-000000000002',date:'2026-09-18',amount:100.125,balance:null,notes:''};
 const request=data=>new Request('https://local/api/investment-history',{method:'POST',body:JSON.stringify(data)});
 for(const type of ['contribution','withdrawal','income','expense']){
  const r=await POST(request({...base,type}));assert.equal(r.status,400);assert.equal((await r.json()).error,'Choose a cash account.');
 }
 assert.equal(calls.length,0);
 for(const type of ['contribution','withdrawal','income','expense']){
  const account_id='53000000-0000-4000-8000-000000000003';
  assert.equal((await POST(request({...base,type,account_id}))).status,200);
  assert.equal(calls.at(-1).path,'/rest/v1/rpc/record_investment_with_account');assert.equal(calls.at(-1).payload.p_account,account_id);assert.equal(calls.at(-1).payload.p_amount,100.125);assert.equal(calls.at(-1).token,'owner');
 }
 assert.equal((await POST(request({...base,type:'valuation',amount:0,balance:80000000}))).status,200);
 assert.equal(calls.at(-1).path,'/rest/v1/rpc/record_investment_event');
});

test('mortgage payments cannot skip the cash account',async()=>{
 const calls=[];
 const {POST}=loadTS('app/api/mortgage-payments/route.ts',{'@/lib/supabase':{session:async()=>({token:'owner'}),sameOrigin:()=>true,supa:async(path,init)=>{calls.push({path,data:JSON.parse(init.body)});return Response.json({ok:true});}}});
 const base={id:'53000000-0000-4000-8000-000000000001',mortgage_id:'53000000-0000-4000-8000-000000000002',principal:100.125,interest:10.25,date:'2026-09-18',notes:''};
 const request=data=>new Request('https://local/api/mortgage-payments',{method:'POST',body:JSON.stringify(data)});
 const rejected=await POST(request(base));assert.equal(rejected.status,400);assert.equal((await rejected.json()).error,'Choose a cash account.');assert.equal(calls.length,0);
 assert.equal((await POST(request({...base,account_id:'53000000-0000-4000-8000-000000000003'}))).status,200);
 assert.equal(calls[0].path,'/rest/v1/rpc/planning_action');assert.equal(calls[0].data.p_data.amount,100.125);assert.equal(calls[0].data.p_data.fee,10.25);
});
