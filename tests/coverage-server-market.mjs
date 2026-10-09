import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';

const {loadMarket,krakenCoins}=loadTS('lib/server-market.ts');
const KEY='test-only-market-key';

// Every upstream request goes to a stub; nothing reaches the network.
async function withFeeds(route,run,{key=KEY}={}){
 const original=globalThis.fetch,warn=console.warn,before=process.env.TWELVE_DATA_API_KEY;
 const calls=[],warnings=[];
 globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});return route(String(url),calls);};
 console.warn=(...args)=>warnings.push(args);
 if(key===null)delete process.env.TWELVE_DATA_API_KEY;else process.env.TWELVE_DATA_API_KEY=key;
 try{return await run({calls,warnings});}
 finally{globalThis.fetch=original;console.warn=warn;if(before===undefined)delete process.env.TWELVE_DATA_API_KEY;else process.env.TWELVE_DATA_API_KEY=before;}
}
const cbu=(rows=[{Ccy:'USD',Rate:'125000',Nominal:'10',Date:'29.09.2026'}])=>Response.json(rows);
const er=(body={result:'success',base_code:'USD',rates:{EUR:.9,GBP:.8,UZS:11000,BAD:-1,ZERO:0,lower:2,XAU:'1',INF:Infinity},time_last_update_unix:1790640000})=>Response.json(body);
function feeds(extra={}){
 return url=>{
  for(const [part,answer] of Object.entries(extra))if(url.includes(part))return typeof answer==='function'?answer(url):answer.clone();
  if(url.includes('cbu.uz'))return cbu();
  if(url.includes('open.er-api.com'))return er();
  throw Error('unexpected '+url);
 };
}

test('exchange rates combine the CBU rate per unit with the filtered global table',async()=>{
 await withFeeds(feeds(),async({calls})=>{
  const data=await loadMarket([],[],false);
  assert.deepEqual(data.fx,{rate:12500,date:'2026-09-29',source:'CBU'});
  // Only positive finite three-letter codes survive; UZS comes from the CBU rate and USD is always 1.
  assert.deepEqual(data.rates,{EUR:.9,GBP:.8,UZS:12500,USD:1});
  assert.equal(data.ratesDate,new Date(1790640000*1000).toISOString().slice(0,10));
  assert.deepEqual(data.errors,{});assert.deepEqual(data.quotes,{});assert.equal(data.stocksConfigured,true);
  const cbuCall=calls.find(call=>call.url.includes('cbu.uz'));
  assert.equal(cbuCall.init.next.revalidate,3600);assert.ok(cbuCall.init.signal instanceof AbortSignal);
  assert.equal(calls.find(call=>call.url.includes('er-api')).init.next.revalidate,86400);
 });
});

test('invalid exchange-rate answers are reported without hiding the other feed',async()=>{
 for(const rows of [[{Ccy:'EUR',Rate:'1',Nominal:'1',Date:'29.09.2026'}],[{Ccy:'USD',Rate:'12000',Nominal:'1',Date:'2026-09-29'}],[{Ccy:'USD',Rate:'-5',Nominal:'1',Date:'29.09.2026'}],[{Ccy:'USD',Rate:'12000',Nominal:null,Date:'29.09.2026'}]]){
  await withFeeds(feeds({'cbu.uz':cbu(rows)}),async()=>{
   const data=await loadMarket([],[],true);
   assert.equal(data.fx,null);assert.equal(data.errors.fx,'Exchange rate unavailable.');
   assert.equal(data.rates.UZS,11000,'without the CBU rate the global table keeps its own UZS');
  });
 }
 for(const body of [{result:'error',base_code:'USD',rates:{},time_last_update_unix:1},{result:'success',base_code:'EUR',rates:{},time_last_update_unix:1},{result:'success',base_code:'USD',rates:{},time_last_update_unix:'soon'}]){
  await withFeeds(feeds({'open.er-api.com':er(body)}),async()=>{
   const data=await loadMarket([],[],true);
   assert.equal(data.errors.rates,'Exchange rate unavailable.');
   assert.deepEqual(data.rates,{USD:1,UZS:12500},'the CBU rate still fills USD and UZS');
   assert.equal(data.ratesDate,undefined);
  });
 }
});

test('crypto prices come from Coinbase, and Kraken for the coins Coinbase cannot price',async()=>{
 assert.ok(krakenCoins.has('XMR'));assert.ok(krakenCoins.has('JUP'));assert.ok(!krakenCoins.has('BTC'));
 await withFeeds(feeds({
  'BTC-USD':Response.json({data:{base:'BTC',currency:'USD',amount:'60000.5'}}),
  'ETH-USD':Response.json({data:{base:'WETH',currency:'USD',amount:'3000'}}),
  'SOL-USD':Response.json({data:{base:'SOL',currency:'EUR',amount:'150'}}),
  'DOGE-USD':Response.json({data:{base:'DOGE',currency:'USD',amount:'0'}}),
  'TON-USD':Response.json({data:{base:'TON',currency:'USD',amount:{value:1}}}),
  'ADA-USD':Response.json({}),
  'XMRUSD':Response.json({error:[],result:{XXMRZUSD:{c:['155.25','1']}}}),
  'KASUSD':Response.json({error:['EQuery:Unknown asset pair']}),
  'JUPUSD':Response.json({error:[],result:{JUPUSD:{c:['0.5']},JUPEUR:{c:['0.4']}}}),
  'MNTUSD':Response.json({error:[],result:{XBTUSD:{c:['1']}}}),
  'OKBUSD':Response.json({error:[],result:{OKBEUR:{c:['1']}}}),
  'GMXUSD':Response.json({error:[],result:{GMXUSD:{}}}),
 }),async({calls})=>{
  const symbols=['BTC','ETH','SOL','DOGE','TON','ADA','XMR','KAS','JUP','MNT','OKB','GMX'];
  const data=await loadMarket(symbols,[],true);
  assert.equal(data.quotes['Crypto:BTC'].usd,60000.5);assert.equal(data.quotes['Crypto:BTC'].source,'Coinbase');
  assert.ok(Number.isFinite(Date.parse(data.quotes['Crypto:BTC'].fetchedAt)));
  assert.deepEqual([data.quotes['Crypto:XMR'].usd,data.quotes['Crypto:XMR'].source],[155.25,'Kraken']);
  for(const symbol of ['ETH','SOL','DOGE','TON','ADA','KAS','JUP','MNT','OKB','GMX']){
   assert.equal(data.quotes['Crypto:'+symbol],undefined,symbol);
   assert.equal(data.errors['Crypto:'+symbol],'Price unavailable. Saved price is shown.',symbol);
  }
  assert.ok(calls.some(call=>call.url==='https://api.kraken.com/0/public/Ticker?pair=XMRUSD'));
  assert.ok(calls.some(call=>call.url==='https://api.coinbase.com/v2/prices/BTC-USD/spot'));
  assert.ok(!calls.some(call=>call.url.includes('coinbase')&&call.url.includes('XMR')),'Kraken coins never ask Coinbase');
 });
});

test('stock prices need a key and a signed-in caller, and only accept USD quotes',async()=>{
 await withFeeds(feeds(),async({calls})=>{
  const data=await loadMarket([],['AAPL'],true);
  assert.equal(data.stocksConfigured,false);assert.equal(data.errors['Stock:AAPL'],'Stock prices need a market-data API key.');
  assert.ok(!calls.some(call=>call.url.includes('twelvedata')));
 },{key:null});
 await withFeeds(feeds(),async({calls})=>{
  const data=await loadMarket([],['AAPL'],false);
  assert.equal(data.errors['Stock:AAPL'],'Sign in to fetch stock prices.');
  assert.ok(!calls.some(call=>call.url.includes('twelvedata')));
 });
 await withFeeds(feeds({'twelvedata':url=>{
  const symbol=new URL(url).searchParams.get('symbol');
  if(symbol==='AAPL')return Response.json({symbol,currency:'USD',close:'201.5',timestamp:1790640000});
  if(symbol==='MSFT')return Response.json({symbol,currency:'USD',close:'400'});
  if(symbol==='NVDA')return Response.json({symbol,currency:'USD',close:'238.89999'});
  if(symbol==='PENNY')return Response.json({symbol,currency:'USD',close:'0.000123456'});
  if(symbol==='SAP')return Response.json({symbol,currency:'EUR',close:'200'});
  if(symbol==='BRK.B')return Response.json({symbol:'BRK',currency:'USD',close:'1'});
  return Response.json({symbol,currency:'USD',close:'-1'});
 }}),async({calls})=>{
  const data=await loadMarket([],['AAPL','MSFT','NVDA','PENNY','SAP','BRK.B','BAD'],true);
  assert.deepEqual({...data.quotes['Stock:AAPL'],fetchedAt:undefined},{usd:201.5,source:'Twelve Data',fetchedAt:undefined,marketTime:new Date(1790640000*1000).toISOString()});
  assert.equal(data.quotes['Stock:MSFT'].usd,400);assert.equal(data.quotes['Stock:MSFT'].marketTime,undefined);
  // Single-precision noise from the feed is dropped (FMT-023); a sub-cent price keeps six significant digits.
  assert.equal(data.quotes['Stock:NVDA'].usd,238.9);assert.equal(data.quotes['Stock:PENNY'].usd,0.000123456);
  for(const symbol of ['SAP','BRK.B','BAD'])assert.equal(data.errors['Stock:'+symbol],'Price unavailable. Saved price is shown.',symbol);
  const url=new URL(calls.find(call=>call.url.includes('twelvedata')).url);
  assert.equal(url.origin+url.pathname,'https://api.twelvedata.com/quote');assert.equal(url.searchParams.get('apikey'),KEY);
 });
});

test('a rate-limited or failing feed is retried once, and warnings never include the key',async()=>{
 // 429 then success: one retry recovers the price.
 await withFeeds(feeds({'twelvedata':(()=>{let n=0;return()=>++n===1?new Response('',{status:429}):Response.json({symbol:'AAPL',currency:'USD',close:'10'});})()}),async({calls,warnings})=>{
  const data=await loadMarket([],['AAPL'],true);
  assert.equal(data.quotes['Stock:AAPL'].usd,10);
  assert.equal(calls.filter(call=>call.url.includes('twelvedata')).length,2);assert.equal(warnings.length,0);
 });
 // Two server errors give up, logging only the host and status.
 await withFeeds(feeds({'twelvedata':new Response('',{status:503})}),async({calls,warnings})=>{
  const data=await loadMarket([],['AAPL'],true);
  assert.equal(data.errors['Stock:AAPL'],'Price unavailable. Saved price is shown.');
  assert.equal(calls.filter(call=>call.url.includes('twelvedata')).length,2);
  assert.deepEqual(warnings,[['Market feed unavailable','api.twelvedata.com',503]]);
  assert.ok(!JSON.stringify(warnings).includes(KEY));
 });
 // A client error is not retried.
 await withFeeds(feeds({'BTC-USD':new Response('',{status:404})}),async({calls,warnings})=>{
  const data=await loadMarket(['BTC'],[],true);
  assert.ok(data.errors['Crypto:BTC']);
  assert.equal(calls.filter(call=>call.url.includes('BTC-USD')).length,1);
  assert.deepEqual(warnings,[['Market feed unavailable','api.coinbase.com',404]]);
 });
 // A network failure is retried once and then reported.
 await withFeeds(feeds({'cbu.uz':()=>{throw TypeError('fetch failed');}}),async({calls,warnings})=>{
  const data=await loadMarket([],[],true);
  assert.equal(data.errors.fx,'Exchange rate unavailable.');
  assert.equal(calls.filter(call=>call.url.includes('cbu.uz')).length,2);
  assert.deepEqual(warnings,[['Market feed unavailable','cbu.uz','network_or_response_error']]);
 });
 // A single network blip recovers; malformed JSON counts as a failure too.
 await withFeeds(feeds({'cbu.uz':(()=>{let n=0;return()=>{if(++n===1)throw TypeError('reset');return cbu();};})(),'open.er-api.com':new Response('not json',{status:200})}),async()=>{
  const data=await loadMarket([],[],true);
  assert.equal(data.fx.rate,12500);assert.equal(data.errors.rates,'Exchange rate unavailable.');
 });
});

test('no more than four upstream requests run at once and every job still finishes',async()=>{
 let active=0,peak=0;
 await withFeeds(async url=>{
  active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,5));active--;
  if(url.includes('cbu.uz'))return cbu();if(url.includes('er-api'))return er();
  const symbol=url.match(/prices\/(\w+)-USD/)[1];return Response.json({data:{base:symbol,currency:'USD',amount:'2'}});
 },async()=>{
  const coins=['BTC','ETH','SOL','ADA','DOT','LTC','XRP','BCH'];
  const data=await loadMarket(coins,[],true);
  assert.equal(peak,4);
  assert.deepEqual(Object.keys(data.quotes).sort(),coins.map(symbol=>'Crypto:'+symbol).sort());
 });
});

test('metals: gold from Twelve Data, silver, platinum and palladium from gold-api.com, each falling back to the other (INV-050)',async()=>{
 const goldApi=(symbol,price)=>Response.json({currency:'USD',name:symbol,price,symbol,updatedAt:'2026-10-09T13:37:50Z'});
 const plan=()=>Response.json({code:404,status:'error',message:'This symbol is available starting with the Grow or Venture plan.'});
 await withFeeds(feeds({
  'twelvedata.com/quote?symbol=XAU':Response.json({symbol:'XAU/USD',close:'4181.6828',timestamp:1791500000}),
  'twelvedata.com':plan(),
  'gold-api.com/price/XAG':goldApi('XAG',60.93),'gold-api.com/price/XPT':goldApi('XPT',1698),'gold-api.com/price/XPD':goldApi('XPD',1175),
 }),async({calls})=>{
  const data=await loadMarket([],[],true,['XAU','XAG','XPT','XPD']);
  assert.deepEqual([data.quotes['Metal:XAU'].usd,data.quotes['Metal:XAU'].source],[4181.6828,'Twelve Data']);
  assert.deepEqual(['XAG','XPT','XPD'].map(m=>[data.quotes['Metal:'+m].usd,data.quotes['Metal:'+m].source]),[[60.93,'gold-api.com'],[1698,'gold-api.com'],[1175,'gold-api.com']]);
  assert.equal(data.quotes['Metal:XAG'].marketTime,'2026-10-09T13:37:50.000Z');
  assert.deepEqual(data.errors,{});
  // Silver never spends a Twelve Data request it would be refused, and gold never asks gold-api.com when Twelve Data answers.
  assert.ok(!calls.some(call=>call.url.includes('twelvedata')&&call.url.includes('XAG')));
  assert.ok(!calls.some(call=>call.url.includes('gold-api.com/price/XAU')));
 });
 // Gold falls back to gold-api.com, silver to Twelve Data; with neither, the saved price is kept.
 await withFeeds(feeds({
  'twelvedata.com/quote?symbol=XAG':Response.json({symbol:'XAG/USD',close:'61.2'}),
  'twelvedata.com':plan(),
  'gold-api.com/price/XAU':goldApi('XAU',4189.6),'gold-api.com/price/XAG':Response.json({error:'down'},{status:503}),
  'gold-api.com/price/XPT':goldApi('XAG',1),'gold-api.com':goldApi('XPD',1175),
 }),async()=>{
  const data=await loadMarket([],[],true,['XAU','XAG','XPT']);
  assert.deepEqual([data.quotes['Metal:XAU'].usd,data.quotes['Metal:XAU'].source],[4189.6,'gold-api.com']);
  assert.deepEqual([data.quotes['Metal:XAG'].usd,data.quotes['Metal:XAG'].source],[61.2,'Twelve Data']);
  assert.equal(data.errors['Metal:XPT'],'Price unavailable. Saved price is shown.','a quote for another metal is refused');
 });
 // No market-data key: metals still come from gold-api.com; a signed-out reader gets none.
 await withFeeds(feeds({'gold-api.com/price/XAG':goldApi('XAG',60.93)}),async({calls})=>{
  assert.equal((await loadMarket([],[],false,['XAG'],true)).quotes['Metal:XAG'].source,'gold-api.com');
  assert.ok(!calls.some(call=>call.url.includes('twelvedata')));
  assert.equal((await loadMarket([],[],false,['XAG'])).errors['Metal:XAG'],'Sign in to fetch metal prices.');
 },{key:null});
});
