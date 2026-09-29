import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(fs.readFileSync('app/api/portfolio-history/route.ts','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
import {loadTS} from './helpers/load-ts.mjs';
const {trackedKinds}=await import('../lib/investment-history.ts');
const {accountRepaymentEvents}=loadTS('lib/investment-benchmarks.ts');
const api=(session,supa)=>new Function('session','supa','income','trackedKinds','accountRepaymentEvents',source+';return GET;')(session,supa,['Salary','Rent income','Other income'],trackedKinds,accountRepaymentEvents);
test('history and actual cash flows remain owner-scoped and cash-flow pagination is complete',async()=>{
 const calls=[];
 const GET=api(async()=>({token:'owner-token'}),async(path,init,token)=>{
  calls.push({path,token});
  if(path.includes('frequency=eq.Once'))return Response.json(path.includes('offset=0')?Array.from({length:500},(_,i)=>({id:String(i)})):[{id:'last'}]);
  if(path.includes('investment_history'))return Response.json([{record_id:'holding',balance:100}]);
  return Response.json([{id:'holding',kind:'Cash',currency:'USD'}]);
 });
 const response=await GET();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 const result=await response.json();assert.equal(result.cashflows.length,501);assert.equal(result.events.length,1);assert.ok(calls.every(call=>call.token==='owner-token'));
 assert.ok(calls.some(call=>call.path.includes('kind=in.(')&&call.path.includes('Valuables')&&call.path.includes('Money%20lent')));
 assert.ok(calls.find(call=>call.path.includes('investment_history')).path.includes('record_id=in.(holding)'));
});
test('anonymous reads and failed cashflow reads do not return a partial comparison',async()=>{
 assert.equal((await api(async()=>null,async()=>{throw Error('must not run');})()).status,401);
 const GET=api(async()=>({token:'owner-token'}),async path=>path.includes('frequency=eq.Once')?new Response(null,{status:503}):Response.json([]));
 const response=await GET();assert.equal(response.status,503);assert.ok((await response.json()).error);
});
test('income history includes recurring plans and preserves the Tracker receipt link',async()=>{
 const GET=api(async()=>({token:'owner'}),async path=>{
  if(path.includes('frequency=eq.Once')){assert.ok(path.includes('select=*'));return Response.json([{id:'receipt',kind:'Other income',frequency:'Once',history_event_id:'dividend'}]);}
  if(path.includes('frequency=neq.Once'))return Response.json([{id:'salary',kind:'Salary',frequency:'Monthly',end_date:null}]);
  return Response.json([]);
 });
 const result=await(await GET()).json();assert.equal(result.incomeRecords.length,2);assert.equal(result.incomeRecords[0].history_event_id,'dividend');assert.equal(result.incomeRecords[1].frequency,'Monthly');
});
test('repayments saved from Accounts reach the chart as dated repayments, read with the owner\'s token',async()=>{
 const calls=[];
 const GET=api(async()=>({token:'owner'}),async(path,init,token)=>{
  calls.push({path,token});
  if(path.includes('account_activity'))return Response.json([
   {id:'r1',action:'repayment',account_id:'wallet',target_id:'loan',amount:400.25,occurred_on:'2026-09-10',notes:'September',created_at:'2026-09-10T08:00:00Z'},
   {id:'r2',action:'repayment',account_id:'wallet',target_id:'lent',amount:150,occurred_on:'2026-09-12',notes:'',created_at:'2026-09-12T08:00:00Z'},
   {id:'r3',action:'repayment',account_id:'wallet',target_id:'someone-else',amount:99,occurred_on:'2026-09-12',notes:''},
  ]);
  if(path.includes('investment_history'))return Response.json([{id:'v',record_id:'loan',event_type:'valuation',balance:599.75,occurred_on:'2026-09-10'}]);
  if(path.includes('finance_records?kind=in.(Cash'))return Response.json([{id:'wallet',kind:'Cash',currency:'USD'},{id:'loan',kind:'Loan',currency:'USD'},{id:'lent',kind:'Money lent',currency:'USD'}]);
  return Response.json([]);
 });
 const result=await(await GET()).json();
 const call=calls.find(item=>item.path.includes('account_activity'));
 assert.ok(call.path.includes('action=eq.repayment'));assert.equal(call.token,'owner');
 const repaid=result.events.filter(event=>event.id.startsWith('repayment:'));
 assert.deepEqual(repaid.map(event=>[event.record_id,event.event_type,event.amount,event.balance,event.occurred_on,event.account_link.amount]),[['loan','withdrawal',400.25,null,'2026-09-10',-400.25],['lent','withdrawal',150,null,'2026-09-12',150]]);
 // The balance written with the repayment stays the only valuation.
 assert.equal(result.events.filter(event=>event.balance!==null).length,1);
});
