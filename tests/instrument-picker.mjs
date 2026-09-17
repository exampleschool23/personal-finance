import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {coins,coinName,instrumentFor} from '../lib/market.ts';
const compile=source=>ts.transpileModule(source.replace(/^import .*;\n/gm,'').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const {stocks,instrumentOptions,matchingInstruments,customStockSymbol}=new Function('coins','coinName',compile(fs.readFileSync('lib/instrument-catalog.ts','utf8'))+';return {stocks,instrumentOptions,matchingInstruments,customStockSymbol};')(coins,coinName);
const {fetchMarket}=new Function('instrumentFor',compile(fs.readFileSync('hooks/use-market.ts','utf8').split('export function useMarket')[0])+';return {fetchMarket};')(instrumentFor);

test('crypto catalogue includes TON and preserves existing names and symbol recognition',()=>{
 assert.equal(coins.length,48);
 assert.equal(new Set(coins.map(coin=>coin[0])).size,coins.length);
 for(const coin of coins){
  for(const name of [coin[0],coin[1],coinName(coin)])assert.deepEqual(instrumentFor({kind:'Crypto',name}),{kind:'Crypto',symbol:coin[0]});
 }
 assert.equal(matchingInstruments('Crypto',' ton ')[0].value,'Toncoin (TON)');
 assert.equal(matchingInstruments('Crypto','toncoin')[0].symbol,'TON');
 assert.equal(matchingInstruments('Crypto','USD coin')[0].symbol,'USDC');
 assert.equal(matchingInstruments('Crypto','nonexistent').length,0);
});
test('stock catalogue supports company search, share classes, ETFs and custom tickers',()=>{
 assert.equal(stocks.length,68);assert.equal(new Set(stocks.map(stock=>stock[0])).size,stocks.length);
 assert.equal(matchingInstruments('Stock','apple')[0].value,'AAPL');
 assert.equal(matchingInstruments('Stock',' msft ')[0].value,'MSFT');
 assert.equal(matchingInstruments('Stock','berkshire')[0].value,'BRK.B');
 assert.equal(matchingInstruments('Stock','vanguard s&p')[0].value,'VOO');
 for(const item of instrumentOptions('Stock'))assert.deepEqual(instrumentFor({kind:'Stock',name:item.value}),{kind:'Stock',symbol:item.symbol});
 assert.equal(customStockSymbol(' dxyz '),'DXYZ');
 for(const invalid of ['','Apple Inc','AAPL','../../secret','<script>','123','A'.repeat(16)])assert.equal(customStockSymbol(invalid),null);
});
test('large portfolios fetch every crypto and stock symbol within request limits',async()=>{
 const original=globalThis.fetch,calls=[];
 try{
  globalThis.fetch=async url=>{
   const params=new URL(url,'https://local').searchParams;
   const crypto=params.get('crypto').split(',').filter(Boolean),stocks=params.get('stocks').split(',').filter(Boolean);
   calls.push({crypto,stocks});assert.ok(crypto.length<=16);assert.ok(stocks.length<=20);
   const quotes=Object.fromEntries([...crypto.map(symbol=>['Crypto:'+symbol,{usd:1}]),...stocks.map(symbol=>['Stock:'+symbol,{usd:100}])]);
   return Response.json({fx:null,rates:{USD:1},quotes,errors:{},stocksConfigured:true});
  };
  const entries=[...instrumentOptions('Crypto').map(item=>({kind:'Crypto',name:item.value})),...instrumentOptions('Stock').slice(0,42).map(item=>({kind:'Stock',name:item.value}))];
  const result=await fetchMarket([...entries,entries[0]]);
  assert.equal(calls.length,3);assert.equal(Object.keys(result.quotes).length,90);assert.deepEqual(result.errors,{});
  assert.ok(result.quotes['Crypto:TON']);assert.ok(result.quotes['Stock:SBUX']);
 }finally{globalThis.fetch=original;}
});
test('failed price batches retain successful quotes and identify missing symbols',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async()=>++calls===1?Response.json({fx:{rate:12000},quotes:{'Crypto:BTC':{usd:60000}},errors:{},stocksConfigured:false}):new Response(null,{status:503});
  const entries=instrumentOptions('Crypto').slice(0,17).map(item=>({kind:'Crypto',name:item.value}));
  const result=await fetchMarket(entries);
  assert.equal(result.quotes['Crypto:BTC'].usd,60000);assert.ok(result.errors['Crypto:TON']);assert.equal(result.fx.rate,12000);
  globalThis.fetch=async()=>new Response(null,{status:503});
  await assert.rejects(fetchMarket(entries),/Market prices unavailable/);
 }finally{globalThis.fetch=original;}
});
test('cancelled price refresh stops before requesting more batches',async()=>{
 const original=globalThis.fetch;const controller=new AbortController();let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;controller.abort();return Response.json({fx:null,quotes:{},errors:{},stocksConfigured:false});};
  await assert.rejects(fetchMarket(instrumentOptions('Crypto').map(item=>({kind:'Crypto',name:item.value})),controller.signal));
  assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});
