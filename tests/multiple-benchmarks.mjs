import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkSelectionSchema, stockBenchmarks } from '../lib/benchmark-selection.ts';

test('multiple stocks persist as independent benchmark keys, alongside existing choices',()=>{
 const keys=['BTC','SPY','STOCK:NVDA','STOCK:AAPL','STOCK:BRK.B'];
 assert.deepEqual(benchmarkSelectionSchema.parse(JSON.parse(JSON.stringify(keys))),keys);
 assert.deepEqual(stockBenchmarks(keys),[{id:'STOCK:NVDA',symbol:'NVDA'},{id:'STOCK:AAPL',symbol:'AAPL'},{id:'STOCK:BRK.B',symbol:'BRK.B'}]);
 assert.equal(benchmarkSelectionSchema.safeParse(['CUSTOM','PORTFOLIO']).success,true);
});
test('reject empty selections, duplicate stocks, invalid symbols and excessive requests',()=>{
 for(const keys of [[],['STOCK:NVDA','STOCK:NVDA'],['STOCK:'],['STOCK:nvda'],['STOCK:A/B'],Array.from({length:11},(_,i)=>`STOCK:A${i}`)])assert.equal(benchmarkSelectionSchema.safeParse(keys).success,false);
 assert.equal(benchmarkSelectionSchema.safeParse(Array.from({length:10},(_,i)=>`STOCK:A${i}`)).success,true);
});
