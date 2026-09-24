import test from 'node:test';
import assert from 'node:assert/strict';
import { readOverviewBenchmarks, overviewBenchmarkStorageKey, toggleOverviewBenchmark } from '../lib/overview-benchmarks.ts';

test('Overview defaults to no comparisons, remembers selections across refresh and isolates owners',()=>{
 const data=new Map(),storage={getItem:key=>data.get(key)??null};
 assert.deepEqual(readOverviewBenchmarks(storage,'first'),[]);
 let selected=toggleOverviewBenchmark([],'PORTFOLIO');
 selected=toggleOverviewBenchmark(selected,'STOCK:NVDA');
 data.set(overviewBenchmarkStorageKey('first'),JSON.stringify(selected));
 assert.deepEqual(readOverviewBenchmarks(storage,'first'),['PORTFOLIO','STOCK:NVDA']);
 assert.deepEqual(readOverviewBenchmarks(storage,'second'),[]);
 selected=toggleOverviewBenchmark(selected,'PORTFOLIO');
 selected=toggleOverviewBenchmark(selected,'STOCK:NVDA');
 data.set(overviewBenchmarkStorageKey('first'),JSON.stringify(selected));
 assert.deepEqual(readOverviewBenchmarks(storage,'first'),[]);
});
test('invalid and unavailable storage safely use no comparisons',()=>{
 for(const value of ['bad','null','{}','[1]'])assert.deepEqual(readOverviewBenchmarks({getItem:()=>value},'owner'),[]);
 assert.deepEqual(readOverviewBenchmarks({getItem:()=>{throw Error('blocked');}},'owner'),[]);
});
