import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {z} from 'zod';
const source=ts.transpileModule(fs.readFileSync('app/api/portfolio-snapshots/route.ts','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const api=(session,supa,snapshotTotals)=>new Function('z','session','supa','sameOrigin','snapshotTotals',source+';return {GET,POST};')(z,session,supa,req=>req.headers.get('origin')==='https://local',snapshotTotals);
const request=body=>new Request('https://local',{method:'POST',headers:{origin:'https://local','Content-Type':'application/json'},body:JSON.stringify(body)});
const market={fx:null,quotes:{},rates:{USD:1}};
test('snapshot API uses the owner session and current database holdings, ignores client totals and dates',async()=>{
 const calls=[];
 const handlers=api(async()=>({token:'owner'}),async(path,init,token)=>{
  calls.push({path,init,token});
  if(path.includes('/rpc/'))return Response.json({assets:123});
  return Response.json([{id:'holding',kind:'Cash',amount:123,currency:'USD'}]);
 },records=>{assert.equal(records[0].amount,123);return {assets:123,debt:0,rates:{USD:1}};});
 assert.equal((await handlers.POST(request({...market,assets:999,user_id:'other',occurred_on:'2000-01-01'}))).status,200);
 assert.ok(calls.every(call=>call.token==='owner'));
 assert.deepEqual(JSON.parse(calls.at(-1).init.body),{p_assets:123,p_debt:0,p_rates:{USD:1}});
});
test('anonymous, cross-origin, invalid and incomplete market requests cannot save snapshots',async()=>{
 const no=api(async()=>null,async()=>{throw Error('unexpected');},()=>null);assert.equal((await no.GET()).status,401);assert.equal((await no.POST(request(market))).status,401);
 const handlers=api(async()=>({token:'owner'}),async()=>Response.json([]),()=>null);
 assert.equal((await handlers.POST(new Request('https://local',{method:'POST'}))).status,403);
 assert.equal((await handlers.POST(request({...market,rates:{USD:-1}}))).status,400);
 assert.equal((await handlers.POST(request(market))).status,409);
});
test('snapshot read pagination includes all days and stays owner-scoped',async()=>{
 let calls=0;
 const handlers=api(async()=>({token:'owner'}),async(path,init,token)=>{calls++;assert.equal(token,'owner');return Response.json(path.endsWith('offset=0')?Array.from({length:500},()=>({assets:1})):[{assets:2}]);},()=>null);
 const response=await handlers.GET();assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).snapshots.length,501);assert.equal(calls,2);
});
