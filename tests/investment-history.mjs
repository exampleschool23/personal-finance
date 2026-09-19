import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {z} from 'zod';
import {historySeries} from '../lib/investment-history.ts';
const event=(id,date,type,amount,balance=null,ownership=100)=>({id,occurred_on:date,event_type:type,amount,balance,ownership_percentage:ownership,created_at:date+'T12:00:00Z',principal:0,interest:0});
test('birth valuations increase personal value without creating invested cash or income',()=>{
 const result=historySeries([event('a','2024-01-01','baseline',0,8000,50),event('b','2025-01-01','valuation',0,10000,50)]);
 assert.equal(result.balance,5000);assert.equal(result.contributions,0);assert.equal(result.receipts,0);
 assert.deepEqual(result.points.map(p=>p.balance),[4000,5000]);
});
test('sorts historical entries, sums actual rent and costs, and separates cash invested from value',()=>{
 const result=historySeries([event('d','2026-01-01','withdrawal',100,900),event('a','2024-01-01','contribution',500,500),event('c','2025-01-01','income',70),event('b','2024-06-01','expense',20)]);
 assert.equal(result.balance,900);assert.equal(result.contributions,400);assert.equal(result.receipts,70);assert.equal(result.expenses,20);
 assert.equal(result.points[0].date,'2024-01-01');
});
test('mortgage payments show principal and interest without inventing a historic balance',()=>{
 const p={...event('a','2024-01-01','mortgage_payment',300),principal:200,interest:100};
 const result=historySeries([p,event('b','2026-01-01','baseline',0,9000)]);
 assert.equal(result.points[0].balance,null);assert.equal(result.balance,9000);assert.equal(result.principal,200);assert.equal(result.interest,100);
});
const source=fs.readFileSync('app/api/investment-history/route.ts','utf8').replace(/^import .*;\n/gm,'').replace(/export async function/g,'async function');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
let signedIn=true,calls=[],rpcError=null;
const api=new Function('z','session','supa','sameOrigin',js+';return {GET,POST};')(z,async()=>signedIn?{token:'owner-token'}:null,async(path,init,token)=>{calls.push({path,init,token});return rpcError&&path.includes('/rpc/')?Response.json({message:rpcError},{status:400}):Response.json(path.includes('/rpc/')?{ok:true}:[]);},req=>req.headers.get('origin')==='https://local');
const body={id:'10000000-0000-4000-8000-000000000001',record_id:'10000000-0000-4000-8000-000000000002',type:'income',date:'2026-01-01',amount:400,balance:null,notes:'Rent'};
const request=patch=>new Request('https://local/api/investment-history',{method:'POST',headers:{origin:'https://local','Content-Type':'application/json'},body:JSON.stringify({...body,...patch})});
test('saves a cash receipt through the owner-scoped atomic RPC with a stable request id',async()=>{
 calls=[];assert.equal((await api.POST(request({account_id:'10000000-0000-4000-8000-000000000003'}))).status,200);
 assert.equal(calls[0].token,'owner-token');assert.equal(calls[0].path,'/rest/v1/rpc/record_investment_with_account');assert.equal(JSON.parse(calls[0].init.body).p_id,body.id);
});
test('principal additions and repayments send an amount without a client-supplied balance',async()=>{
 for(const type of ['contribution','withdrawal']){
  calls=[];assert.equal((await api.POST(request({type,amount:123.45,balance:null,account_id:'10000000-0000-4000-8000-000000000003'}))).status,200);
  const payload=JSON.parse(calls[0].init.body);
  assert.equal(calls[0].path,'/rest/v1/rpc/record_investment_with_account');assert.equal(payload.p_account,'10000000-0000-4000-8000-000000000003');
  assert.equal(payload.p_type,type);assert.equal(payload.p_amount,123.45);assert.equal(payload.p_balance,null);
 }
});
test('rejects invalid dates, mismatched balances, negative amounts, unauthenticated and cross-origin writes',async()=>{
 for(const patch of [{date:'2026-02-30'},{amount:-1},{amount:0},{balance:100},{type:'valuation',amount:0,balance:null},{record_id:'bad'},{type:'withdrawal',amount:100,balance:null},{type:'contribution',amount:100,balance:null},{account_id:'bad'}])assert.equal((await api.POST(request(patch))).status,400);
 signedIn=false;assert.equal((await api.POST(request({}))).status,401);signedIn=true;
 assert.equal((await api.POST(new Request('https://local',{method:'POST'}))).status,403);
});
test('history reads are scoped to the requested record and authenticated token',async()=>{
 calls=[];assert.equal((await api.GET(new Request('https://local?record='+body.record_id))).status,200);
 assert.ok(calls[0].path.includes('record_id=eq.'+body.record_id));assert.equal(calls[0].token,'owner-token');
});
test('migration keeps owner RLS, atomic locks, idempotency and newer balances intact',()=>{
 const sql=fs.readFileSync('migrations/012_investment_history.sql','utf8');
 for(const required of ['ENABLE ROW LEVEL SECURITY','USING(user_id=auth.uid())','REVOKE ALL ON public.investment_history FROM PUBLIC,anon,authenticated','AND user_id=auth.uid() FOR UPDATE','existing.balance IS DISTINCT FROM p_balance','p_date>=last_date',"p_type IN ('income','expense')",'NEW.history_event_id','capture_mortgage_history'])assert.ok(sql.includes(required),required);
 assert.ok(fs.readFileSync('database/setup.sql','utf8').includes(sql));
});

test('account failures are confirmed validation errors so the user can correct the selection',async()=>{
 try{
  for(const error of ['Choose a cash account in the record currency.','Not enough money in the selected cash account.','Enter transactions on or after the latest cash balance date.','This update was already saved without an account.']){
   rpcError=error;const result=await api.POST(request({account_id:'10000000-0000-4000-8000-000000000003'}));
   assert.equal(result.status,400);assert.equal((await result.json()).error,error);
  }
 }finally{rpcError=null;}
});
