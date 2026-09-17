import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as dates from '../lib/benchmark-data.ts';
const source=ts.transpileModule(fs.readFileSync('app/api/benchmarks/route.ts','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
let auth=true;
const deps={...dates,session:async()=>auth?{token:'owner'}:null,depositToday:()=> '2026-09-17'};
const GET=new Function(...Object.keys(deps),source+';return GET;')(...Object.values(deps));
const request=(params='start=2026-09-14&end=2026-09-17')=>new Request('https://local/api/benchmarks?'+params);
test('rejects anonymous users, invalid dates, future or reversed periods, and arbitrary symbols',async()=>{
 auth=false;assert.equal((await GET(request())).status,401);auth=true;
 for(const params of ['start=2026-02-30&end=2026-03-01','start=2026-09-14&end=2026-09-18','start=2015-01-01&end=2026-09-17','start=2026-09-17&end=2026-09-16','start=2026-09-14&end=2026-09-17&symbol=../../secret'])assert.equal((await GET(request(params))).status,400);
});
test('fetches adjusted fund history, validates USD, parses candles and dated nominal FX, without leaking the key',async()=>{
 const original=globalThis.fetch,key=process.env.TWELVE_DATA_API_KEY;
 try{
  process.env.TWELVE_DATA_API_KEY='test-secret';let calls=[];
  globalThis.fetch=async raw=>{
   const url=new URL(raw);calls.push(url);
   if(url.hostname==='api.twelvedata.com'){
    assert.equal(url.searchParams.get('adjust'),'all');
    const symbol=url.searchParams.get('symbol');return Response.json({meta:{symbol,currency:symbol==='BAD'?'EUR':'USD'},values:[{datetime:'2026-09-14',close:'100'},{datetime:'2026-09-17',close:'110'}]});
   }
   if(url.hostname==='api.exchange.coinbase.com')return Response.json(['2026-09-14','2026-09-15','2026-09-16','2026-09-17'].map(date=>[dates.dateMillis(date)/1000,0,0,0,50000,1]));
   const date=url.pathname.split('/').filter(Boolean).at(-1),display=date.split('-').reverse().join('.');
   return Response.json([{Ccy:'USD',Rate:'12000',Nominal:'1',Date:display},{Ccy:'JPY',Rate:'8000',Nominal:'100',Date:display}]);
  };
  const response=await GET(request('start=2026-09-14&end=2026-09-17&symbol=BAD'));assert.equal(response.status,200);
  const data=await response.json();assert.equal(data.prices.SPY[0].close,100);assert.equal(data.prices.BTC.length,4);assert.equal(data.fx[0].rates.UZS,12000);assert.equal(data.fx[0].rates.JPY,150);assert.ok(data.errors.CUSTOM);assert.ok(!JSON.stringify(data).includes('test-secret'));assert.ok(calls.length<40);
 }finally{globalThis.fetch=original;if(key===undefined)delete process.env.TWELVE_DATA_API_KEY;else process.env.TWELVE_DATA_API_KEY=key;}
});
test('missing connections and failing feeds remain explicit rather than generating sample prices',async()=>{
 const original=globalThis.fetch,key=process.env.TWELVE_DATA_API_KEY;
 try{delete process.env.TWELVE_DATA_API_KEY;globalThis.fetch=async()=>{throw Error('offline');};const data=await(await GET(request())).json();assert.deepEqual(data.prices,{});assert.deepEqual(data.fx,[]);for(const name of ['SPY','HYG','BTC','fx'])assert.ok(data.errors[name]);}
 finally{globalThis.fetch=original;if(key!==undefined)process.env.TWELVE_DATA_API_KEY=key;}
});
test('first-day comparison uses the latest completed BTC candle, while interior gaps still fail',async()=>{
 const original=globalThis.fetch;
 try{
  let missingInterior=false;
  globalThis.fetch=async raw=>{
   const url=new URL(raw);
   if(url.hostname==='api.exchange.coinbase.com')return Response.json((missingInterior?['2026-09-14','2026-09-16']:['2026-09-16']).map(date=>[dates.dateMillis(date)/1000,0,0,0,50000,1]));
   const date=url.pathname.split('/').filter(Boolean).at(-1);
   return Response.json([{Ccy:'USD',Rate:'12000',Nominal:'1',Date:date.split('-').reverse().join('.')}]);
  };
  const first=await(await GET(request('start=2026-09-17&end=2026-09-17&benchmarks=BTC'))).json();assert.equal(first.prices.BTC[0].date,'2026-09-16');assert.equal(first.errors.BTC,undefined);
  missingInterior=true;
  const gaps=await(await GET(request('start=2026-09-14&end=2026-09-17&benchmarks=BTC'))).json();assert.equal(gaps.prices.BTC,undefined);assert.ok(gaps.errors.BTC);
 }finally{globalThis.fetch=original;}
});

test('BTC comparison recovers from a temporary provider failure',async()=>{
 const original=globalThis.fetch;let attempts=0;
 try{
  globalThis.fetch=async raw=>{
   if(new URL(raw).hostname==='api.exchange.coinbase.com'){
    if(++attempts===1)return new Response('',{status:503});
    return Response.json(['2026-09-14','2026-09-15','2026-09-16','2026-09-17'].map(date=>[dates.dateMillis(date)/1000,0,0,0,50000,1]));
   }
   return new Response('',{status:404});
  };
  const data=await(await GET(request('start=2026-09-14&end=2026-09-17&benchmarks=BTC'))).json();
  assert.equal(attempts,2);assert.equal(data.prices.BTC.length,4);assert.equal(data.errors.BTC,undefined);
 }finally{globalThis.fetch=original;}
});
