import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { coins, metalCodes } from '../lib/market.ts';
let source=fs.readFileSync(new URL('../app/api/market/route.ts',import.meta.url),'utf8');
source=fs.readFileSync(new URL('../lib/server-market.ts',import.meta.url),'utf8')+'\n'+source;
source=source.replace(/import .* from .*;\n/g,'');
source='const coins = '+JSON.stringify(coins)+'; const isMetalCode=value=>'+JSON.stringify(metalCodes)+'.includes(value); const session=async()=>globalThis.marketTestSession; const limits={publicMarket:[],market:[]}; const rateLimited=async(...args)=>globalThis.marketTestLimited?.(...args)??false; const tooManyAttempts=()=>Response.json({error:\'Too many attempts. Please try again later.\'},{status:429});\n'+source;
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {GET}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('market endpoint validates symbols, isolates failures, and protects stock access',async()=>{
 const original=globalThis.fetch, key=process.env.TWELVE_DATA_API_KEY;
 try {
  process.env.TWELVE_DATA_API_KEY='test-only';globalThis.marketTestSession=null;
  let stockCalls=0;
  globalThis.fetch=async(url)=>{
   if(url.includes('open.er-api.com')) return Response.json({result:'success',base_code:'USD',rates:{USD:1,EUR:.9,UZS:11000,BAD:-1},time_last_update_unix:1700000000});
   if(url.includes('cbu.uz')) return Response.json([{Ccy:'USD',Rate:'12000',Nominal:'1',Date:'16.09.2026'}]);
   if(url.includes('twelvedata')) {stockCalls++;return Response.json({symbol:'AAPL',currency:'USD',close:'200',timestamp:1700000000});}
   if(url.includes('TON-USD')) return Response.json({data:{base:'TON',currency:'USD',amount:'1.33'}});
   if(url.includes('ETH-USD')) return Response.json({data:{base:'ETH',currency:'USD',amount:'NaN'}});
   return Response.json({data:{base:'BTC',currency:'USD',amount:'60000'}});
  };
  assert.equal((await GET(new Request('http://localhost/api/market?stocks=bad%20symbol'))).status,400);
  let data=await (await GET(new Request('http://localhost/api/market?crypto=BTC,ETH&stocks=AAPL'))).json();
  assert.equal(data.fx.rate,12000);assert.equal(data.rates.EUR,.9);assert.equal(data.rates.UZS,12000);assert.equal(data.rates.BAD,undefined);assert.equal(data.quotes['Crypto:BTC'].usd,60000);
  assert.ok(data.errors['Crypto:ETH']);assert.equal(stockCalls,0);assert.ok(data.errors['Stock:AAPL']);
  globalThis.marketTestSession={user:{id:'test'}};
  data=await (await GET(new Request('http://localhost/api/market?stocks=AAPL'))).json();
  assert.equal(data.quotes['Stock:AAPL'].usd,200);assert.equal(stockCalls,1);
  const ton=await(await GET(new Request('http://localhost/api/market?crypto=TON'))).json();
  assert.equal(ton.quotes['Crypto:TON'].usd,1.33);
  assert.equal((await GET(new Request('http://localhost/api/market?crypto='+coins.slice(0,17).map(coin=>coin[0]).join(',')))).status,400);
  globalThis.fetch=async()=>{throw Error('network failure');};
  data=await (await GET(new Request('http://localhost/api/market?crypto=BTC'))).json();
  assert.equal(data.fx,null);assert.deepEqual(data.quotes,{});assert.ok(data.errors.fx);
 } finally {globalThis.fetch=original;delete globalThis.marketTestSession;if(key===undefined)delete process.env.TWELVE_DATA_API_KEY;else process.env.TWELVE_DATA_API_KEY=key;}
});

test('BTC spot recovers from temporary rate limiting',async()=>{
 const original=globalThis.fetch;let attempts=0;
 try{
  globalThis.fetch=async url=>{
   if(url.includes('/BTC-USD/spot'))return ++attempts===1?new Response('',{status:429}):Response.json({data:{base:'BTC',currency:'USD',amount:'60000'}});
   return new Response('',{status:404});
  };
  const data=await(await GET(new Request('http://localhost/api/market?crypto=BTC'))).json();
  assert.equal(attempts,2);assert.equal(data.quotes['Crypto:BTC'].usd,60000);assert.equal(data.errors['Crypto:BTC'],undefined);
 }finally{globalThis.fetch=original;}
});

test('coins Coinbase cannot price are quoted from Kraken, never from a lookalike ticker',async()=>{
 const {krakenCoins}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
 for(const symbol of krakenCoins)assert.ok(coins.some(coin=>coin[0]===symbol),symbol);
 assert.ok(krakenCoins.has('JUP'));assert.ok(krakenCoins.has('XMR'));assert.ok(!krakenCoins.has('BTC'));
 const original=globalThis.fetch,asked=[];
 try{
  globalThis.fetch=async raw=>{
   const url=new URL(raw);asked.push(url.hostname+url.pathname+url.search);
   if(url.hostname==='api.kraken.com'){
    const pair=url.searchParams.get('pair');
    if(pair==='JUPUSD')return Response.json({error:[],result:{JUPUSD:{c:['0.31465','169']}}});
    if(pair==='XMRUSD')return Response.json({error:[],result:{XXMRZUSD:{c:['547.06','1']}}});
    if(pair==='KASUSD')return Response.json({error:['EQuery:Unknown asset pair']});
    if(pair==='NEOUSD')return Response.json({error:[],result:{XDGUSD:{c:['0.09','1']}}});
    if(pair==='MNTUSD')return Response.json({error:[],result:{MNTUSD:{c:['0','1']}}});
   }
   // The unrelated asset Coinbase answers with for the JUP ticker.
   if(url.pathname.includes('/JUP-USD/'))return Response.json({data:{base:'JUP',currency:'USD',amount:'0.00032'}});
   if(url.pathname.includes('/BTC-USD/'))return Response.json({data:{base:'BTC',currency:'USD',amount:'60000'}});
   return new Response('',{status:404});
  };
  const data=await(await GET(new Request('http://localhost/api/market?crypto=JUP,XMR,KAS,NEO,MNT,BTC'))).json();
  assert.equal(data.quotes['Crypto:JUP'].usd,0.31465);assert.equal(data.quotes['Crypto:JUP'].source,'Kraken');
  assert.equal(data.quotes['Crypto:XMR'].usd,547.06);
  assert.equal(data.quotes['Crypto:BTC'].usd,60000);assert.equal(data.quotes['Crypto:BTC'].source,'Coinbase');
  for(const symbol of ['KAS','NEO','MNT']){assert.equal(data.quotes['Crypto:'+symbol],undefined,symbol);assert.ok(data.errors['Crypto:'+symbol],symbol);}
  assert.ok(!asked.some(url=>url.includes('JUP-USD')));
  assert.ok(!asked.some(url=>url.startsWith('api.kraken.com')&&url.includes('BTC')));
 }finally{globalThis.fetch=original;}
});
test('anonymous market reads are rate limited per visitor, signed-in reads per person',async()=>{
 const original=globalThis.fetch;const counted=[];
 try{
  globalThis.fetch=async()=>Response.json({data:{base:'BTC',currency:'USD',amount:'60000'}});
  globalThis.marketTestLimited=async(req,name)=>{counted.push(name);return true;};
  globalThis.marketTestSession=null;
  const limited=await GET(new Request('http://localhost/api/market?crypto=BTC'));
  assert.equal(limited.status,429);assert.equal((await limited.json()).error,'Too many attempts. Please try again later.');
  assert.deepEqual(counted,['market']);
  globalThis.marketTestSession={user:{id:'test'}};
  assert.equal((await GET(new Request('http://localhost/api/market?crypto=BTC'))).status,429);
  assert.deepEqual(counted,['market','market-user']);
  globalThis.marketTestLimited=async(req,name)=>{counted.push(name);return false;};
  assert.equal((await GET(new Request('http://localhost/api/market?crypto=BTC'))).status,200);
 }finally{globalThis.fetch=original;delete globalThis.marketTestLimited;delete globalThis.marketTestSession;}
});
