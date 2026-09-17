import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(fs.readFileSync('app/api/portfolio-history/route.ts','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const api=(session,supa)=>new Function('session','supa','income',source+';return GET;')(session,supa,['Salary','Rent income','Other income']);
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
