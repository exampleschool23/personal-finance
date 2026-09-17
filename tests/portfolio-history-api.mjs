import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(fs.readFileSync('app/api/portfolio-history/route.ts','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const api=(session,supa)=>new Function('session','supa',source+';return GET;')(session,supa);
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
