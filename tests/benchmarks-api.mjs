import { isCurrency } from '../lib/currencies.ts';
import { portfolioAssets, portfolioAssetKey, diversifiedPortfolioSchema } from '../lib/diversified-portfolio.ts';
import { benchmarkSelectionSchema, stockBenchmarks } from '../lib/benchmark-selection.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as dates from '../lib/benchmark-data.ts';
const source=ts.transpileModule(fs.readFileSync('app/api/benchmarks/route.ts','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
let auth=true;
const deps={isCurrency,portfolioAssets,portfolioAssetKey,diversifiedPortfolioSchema,benchmarkSelectionSchema,stockBenchmarks,...dates,session:async()=>auth?{token:'owner'}:null,depositToday:()=> '2026-09-17'};
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

test('BTC falls back to a complete Bitfinex USD series after HTTP errors or incomplete Coinbase history',async()=>{
 const original=globalThis.fetch;
 try{
  for(const failure of ['http','gap']){
   let fallbackCalls=0;
   globalThis.fetch=async(raw,options)=>{
    const url=new URL(raw);
    if(url.hostname==='api.exchange.coinbase.com'){
     assert.equal(options.cache,'no-store');
     return failure==='http'?new Response('',{status:403}):Response.json([[dates.dateMillis('2026-09-14')/1000,0,0,0,99999,1]]);
    }
    if(url.hostname==='api-pub.bitfinex.com'){
     fallbackCalls++;assert.equal(options.cache,'no-store');
     assert.equal(url.pathname,'/v2/candles/trade:1D:tBTCUSD/hist');
     assert.equal(url.searchParams.get('sort'),'1');
     return Response.json(['2026-09-14','2026-09-15','2026-09-16','2026-09-17'].map(date=>[dates.dateMillis(date),40000,50000.12345678,60000,30000,1]));
    }
    return Response.json([{Ccy:'USD',Rate:'12000',Nominal:'1',Date:'14.09.2026'}]);
   };
   const data=await(await GET(request('start=2026-09-14&end=2026-09-17&benchmarks=BTC'))).json();
   assert.equal(fallbackCalls,1);assert.equal(data.errors.BTC,undefined);assert.equal(data.prices.BTC.length,4);
   assert.ok(data.prices.BTC.every(point=>point.close===50000.12345678));
  }
 }finally{globalThis.fetch=original;}
});

test('fallback paginates long BTC histories without gaps or duplicate days',async()=>{
 const original=globalThis.fetch;let windows=[];
 try{
  globalThis.fetch=async raw=>{
   const url=new URL(raw);
   if(url.hostname==='api.exchange.coinbase.com')return Response.json([]);
   if(url.hostname==='api-pub.bitfinex.com'){
    const start=Number(url.searchParams.get('start')),end=Number(url.searchParams.get('end'));
    windows.push([start,end]);assert.ok(end-start<299*dates.dayMillis);
    const rows=[];for(let time=start;time<=end;time+=dates.dayMillis)rows.push([time,1,50000,1,1,1]);
    return Response.json(rows.reverse());
   }
   return Response.json([{Ccy:'USD',Rate:'12000',Nominal:'1',Date:'01.01.2025'}]);
  };
  const data=await(await GET(request('start=2025-01-01&end=2026-09-17&benchmarks=BTC'))).json();
  assert.equal(windows.length,3);assert.equal(data.errors.BTC,undefined);
  assert.equal(data.prices.BTC.length,(dates.dateMillis('2026-09-17')-dates.dateMillis('2025-01-01'))/dates.dayMillis+1);
  for(let i=1;i<windows.length;i++)assert.equal(windows[i][0],windows[i-1][1]+1);
 }finally{globalThis.fetch=original;}
});

test('invalid fallback prices, missing days, and malformed timestamps remain unavailable and uncached',async()=>{
 const original=globalThis.fetch;
 try{
  for(const invalid of ['gap','price','timestamp','error']){
   globalThis.fetch=async raw=>{
    const url=new URL(raw);
    if(url.hostname==='api.exchange.coinbase.com')return Response.json([]);
    if(url.hostname==='api-pub.bitfinex.com'){
     if(invalid==='error')return Response.json({error:'unavailable'});
     const rows=['2026-09-14','2026-09-15','2026-09-16'].map(date=>[dates.dateMillis(date),1,50000,1,1,1]);
     if(invalid==='gap')rows.splice(1,1);
     if(invalid==='price')rows[1][2]=-1;
     if(invalid==='timestamp')rows[1][0]=1e30;
     return Response.json(rows);
    }
    return Response.json([{Ccy:'USD',Rate:'12000',Nominal:'1',Date:'14.09.2026'}]);
   };
   const response=await GET(request('start=2026-09-14&end=2026-09-17&benchmarks=BTC'));
   assert.equal(response.headers.get('cache-control'),'private, no-store');
   const data=await response.json();assert.equal(data.prices.BTC,undefined);assert.ok(data.errors.BTC);
  }
 }finally{globalThis.fetch=original;}
});
test('diversified portfolio fetches the chosen crypto and stock with separate keys',async()=>{
 const original=globalThis.fetch,key=process.env.TWELVE_DATA_API_KEY;
 try{
  process.env.TWELVE_DATA_API_KEY='test';const calls=[];
  globalThis.fetch=async raw=>{
   const url=new URL(raw);calls.push(url);
   if(url.hostname==='api.twelvedata.com')return Response.json({meta:{symbol:'QQQ',currency:'USD'},values:[{datetime:'2026-09-14',close:'100'},{datetime:'2026-09-17',close:'110'}]});
   if(url.hostname==='api.exchange.coinbase.com')return Response.json(['2026-09-14','2026-09-15','2026-09-16','2026-09-17'].map(date=>[dates.dateMillis(date)/1000,0,0,0,2000,1]));
   const date=url.pathname.split('/').filter(Boolean).at(-1);
   return Response.json([{Ccy:'USD',Rate:'12000',Nominal:'1',Date:date.split('-').reverse().join('.')}]);
  };
  const data=await(await GET(request('start=2026-09-14&end=2026-09-17&benchmarks=PORTFOLIO&portfolioCrypto=ETH&portfolioStock=QQQ'))).json();
  assert.equal(data.prices.portfolioCrypto.length,4);assert.equal(data.prices.portfolioStock[0].close,100);
  assert.ok(calls.some(url=>url.pathname.includes('ETH-USD')));assert.ok(calls.some(url=>url.searchParams.get('symbol')==='QQQ'));assert.equal(data.prices.BTC,undefined);
  const invalid=await GET(request('start=2026-09-14&end=2026-09-17&benchmarks=PORTFOLIO&portfolioCrypto=../secret'));assert.equal(invalid.status,400);
 }finally{globalThis.fetch=original;if(key===undefined)delete process.env.TWELVE_DATA_API_KEY;else process.env.TWELVE_DATA_API_KEY=key;}
});
test('fetches several custom stocks independently and deduplicates shared portfolio history',async()=>{
 const original=globalThis.fetch,key=process.env.TWELVE_DATA_API_KEY;
 try{
  process.env.TWELVE_DATA_API_KEY='test';const symbols=[];
  globalThis.fetch=async raw=>{
   const url=new URL(raw);
   if(url.hostname==='api.twelvedata.com'){
    const symbol=url.searchParams.get('symbol');symbols.push(symbol);
    return Response.json({meta:{symbol,currency:'USD'},values:[{datetime:'2026-09-14',close:symbol==='NVDA'?'100':'50'},{datetime:'2026-09-17',close:'110'}]});
   }
   const date=url.pathname.split('/').filter(Boolean).at(-1);
   return Response.json([{Ccy:'USD',Rate:'12000',Nominal:'1',Date:date.split('-').reverse().join('.')}]);
  };
  const data=await(await GET(request('start=2026-09-14&end=2026-09-17&benchmarks=STOCK:NVDA,STOCK:AAPL,PORTFOLIO&portfolioStock=NVDA'))).json();
  assert.equal(data.prices['STOCK:NVDA'][0].close,100);
  assert.equal(data.prices['STOCK:AAPL'][0].close,50);
  assert.deepEqual(data.prices.portfolioStock,data.prices['STOCK:NVDA']);
  assert.deepEqual(symbols.sort(),['AAPL','NVDA']);
 }finally{globalThis.fetch=original;if(key===undefined)delete process.env.TWELVE_DATA_API_KEY;else process.env.TWELVE_DATA_API_KEY=key;}
});
test('editable portfolios fetch every active market asset and skip deleted or zero-weight assets',async()=>{
 const original=globalThis.fetch,key=process.env.TWELVE_DATA_API_KEY;
 try{
  process.env.TWELVE_DATA_API_KEY='test';const symbols=[];
  globalThis.fetch=async raw=>{
   const url=new URL(raw);
   if(url.hostname==='api.twelvedata.com'){
    const symbol=url.searchParams.get('symbol');symbols.push(symbol);
    return Response.json({meta:{symbol,currency:'USD'},values:[{datetime:'2026-09-14',close:'100'},{datetime:'2026-09-17',close:'110'}]});
   }
   const date=url.pathname.split('/').filter(Boolean).at(-1);
   return Response.json([{Ccy:'USD',Rate:'12000',Nominal:'1',Date:date.split('-').reverse().join('.')}]);
  };
  const portfolio={crypto:20,stock:20,deposit:20,business:20,cash:20,cryptoSymbol:'BTC',stockSymbol:'SPY',businessRate:0,assets:[{id:'a',kind:'stock',symbol:'NVDA',weight:60},{id:'b',kind:'stock',symbol:'AAPL',weight:40},{id:'c',kind:'crypto',symbol:'BTC',weight:0}]};
  const params=new URLSearchParams({start:'2026-09-14',end:'2026-09-17',benchmarks:'PORTFOLIO',portfolio:JSON.stringify(portfolio)});
  const data=await(await GET(request(params.toString()))).json();
  assert.deepEqual(symbols.sort(),['AAPL','NVDA']);assert.equal(data.prices.portfolio_a.length,2);assert.equal(data.prices.portfolio_b.length,2);assert.equal(data.prices.portfolio_c,undefined);
  params.set('portfolio','{');assert.equal((await GET(request(params.toString()))).status,400);
 }finally{globalThis.fetch=original;if(key===undefined)delete process.env.TWELVE_DATA_API_KEY;else process.env.TWELVE_DATA_API_KEY=key;}
});

test('anonymous demo uses fixed real-feed queries, shares concurrent work and ignores arbitrary symbols',async()=>{
 const original=globalThis.fetch,key=process.env.TWELVE_DATA_API_KEY;
 try{
  auth=false;process.env.TWELVE_DATA_API_KEY='test-secret';
  const symbols=[];let calls=0;
  globalThis.fetch=async raw=>{
   calls++;const url=new URL(raw);
   if(url.hostname==='api.twelvedata.com'){
    const symbol=url.searchParams.get('symbol');symbols.push(symbol);
    assert.equal(symbol,'SPY');
    return Response.json({meta:{symbol,currency:'USD'},values:[{datetime:'2025-09-17',close:'500'},{datetime:'2026-09-17',close:'550'}]});
   }
   if(url.hostname==='api.exchange.coinbase.com'){
    const start=url.searchParams.get('start').slice(0,10),end=url.searchParams.get('end').slice(0,10),rows=[];
    for(let date=start;date<end;date=dates.shiftDay(date,1))rows.push([dates.dateMillis(date)/1000,0,0,0,65000,1]);
    return Response.json(rows);
   }
   const date=url.pathname.split('/').filter(Boolean).at(-1);
   return Response.json([{Ccy:'USD',Rate:'12500',Nominal:'1',Date:date.split('-').reverse().join('.')}]);
  };
  const responses=await Promise.all([GET(request('demo=1&symbol=NVDA&start=2016-01-01')),GET(request('demo=1'))]);
  const a=await responses[0].json(),b=await responses[1].json();
  assert.deepEqual(a,b);assert.equal(a.start,'2025-09-17');assert.equal(a.end,'2026-09-17');
  assert.equal(a.prices.SPY[0].close,500);assert.equal(a.prices.BTC[0].close,65000);
  assert.deepEqual(symbols,['SPY']);assert.deepEqual(a.errors,{});
  const previous=calls;await GET(request('demo=1'));assert.equal(calls,previous);
  assert.equal((await GET(request())).status,401,'Normal benchmark queries still require authentication');
 }finally{auth=true;globalThis.fetch=original;if(key===undefined)delete process.env.TWELVE_DATA_API_KEY;else process.env.TWELVE_DATA_API_KEY=key;}
});
