import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const market={fx:null,quotes:{},rates:{USD:1}};
const api=(session,supa,snapshotTotals,loadMarket=async()=>market)=>loadTS('app/api/portfolio-snapshots/route.ts',{'@/lib/supabase':{session,supa,sameOrigin:req=>req.headers.get('origin')==='https://local'},'@/lib/portfolio-snapshots':{snapshotTotals},'@/lib/server-market':{loadMarket}});
const request=body=>new Request('https://local',{method:'POST',headers:{origin:'https://local','Content-Type':'application/json'},body:JSON.stringify(body)});
test('snapshots use owner holdings and server quotes, ignoring forged client totals, dates and rates',async()=>{
 const calls=[];let fetched=false;
 const handlers=api(async()=>({token:'owner'}),async(path,init,token)=>{calls.push({path,init,token});return path.includes('/rpc/')?Response.json({assets:123}):Response.json([{id:'holding',kind:'Stock',name:'AAPL',amount:123,currency:'USD'}]);},(records,prices)=>{assert.equal(records[0].amount,123);assert.equal(prices,market);return {assets:123,debt:0,rates:{USD:1}};},async(crypto,stocks,access)=>{fetched=true;assert.deepEqual(crypto,[]);assert.deepEqual(stocks,['AAPL']);assert.equal(access,true);return market;});
 assert.equal((await handlers.POST(request({assets:999,user_id:'other',occurred_on:'2000-01-01',rates:{USD:-1},quotes:{'Stock:AAPL':{usd:999999}}}))).status,200);assert.ok(fetched);assert.ok(calls.every(call=>call.token==='owner'));assert.deepEqual(JSON.parse(calls.at(-1).init.body),{p_assets:123,p_debt:0,p_rates:{USD:1}});
});
test('anonymous, cross-origin, failed prices and incomplete values cannot save snapshots',async()=>{
 const no=api(async()=>null,async()=>{throw Error('unexpected');},()=>null);assert.equal((await no.GET()).status,401);assert.equal((await no.POST(request({}))).status,401);
 let writes=0;const handlers=api(async()=>({token:'owner'}),async(path)=>{if(path.includes('/rpc/'))writes++;return Response.json([]);},()=>null);
 assert.equal((await handlers.POST(new Request('https://local',{method:'POST'}))).status,403);assert.equal((await handlers.POST(request({}))).status,409);assert.equal(writes,0);
 const failed=api(async()=>({token:'owner'}),async()=>Response.json([]),()=>{throw Error('unexpected')},async()=>{throw Error('feed unavailable')});assert.equal((await failed.POST(request({}))).status,503);
});
test('snapshot read pagination includes all days and stays owner scoped',async()=>{
 let calls=0;const handlers=api(async()=>({token:'owner'}),async(path,init,token)=>{calls++;assert.equal(token,'owner');return Response.json(path.endsWith('offset=0')?Array.from({length:500},()=>({assets:1})):[{assets:2}]);},()=>null);
 const response=await handlers.GET();assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).snapshots.length,501);assert.equal(calls,2);
});
