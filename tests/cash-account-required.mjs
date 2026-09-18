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
