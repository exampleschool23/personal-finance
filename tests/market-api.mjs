import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { coins } from '../lib/market.ts';
let source=fs.readFileSync(new URL('../app/api/market/route.ts',import.meta.url),'utf8');
source=fs.readFileSync(new URL('../lib/server-market.ts',import.meta.url),'utf8')+'\n'+source;
source=source.replace(/import .* from .*;\n/g,'');
source='const coins = '+JSON.stringify(coins)+'; const session=async()=>globalThis.marketTestSession;\n'+source;
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
  globalThis.fetch=async()=>{throw Error('network failure');};
  data=await (await GET(new Request('http://localhost/api/market?crypto=BTC'))).json();
  assert.equal(data.fx,null);assert.deepEqual(data.quotes,{});assert.ok(data.errors.fx);
 } finally {globalThis.fetch=original;delete globalThis.marketTestSession;if(key===undefined)delete process.env.TWELVE_DATA_API_KEY;else process.env.TWELVE_DATA_API_KEY=key;}
});
