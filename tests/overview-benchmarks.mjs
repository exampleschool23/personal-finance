import test from 'node:test';
import assert from 'node:assert/strict';
import { readOverviewBenchmarks, overviewBenchmarkStorageKey, toggleOverviewBenchmark, overviewSeriesVisible } from '../lib/overview-benchmarks.ts';

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

 test('net worth can be hidden independently, persists per owner and defaults visible for older preferences',()=>{
 const original=['BTC'];
 assert.equal(overviewSeriesVisible(original,'actual'),true);
 const hidden=toggleOverviewBenchmark(original,'actual');
 assert.equal(overviewSeriesVisible(hidden,'actual'),false);
 assert.equal(overviewSeriesVisible(hidden,'BTC'),true);
 const storage={getItem:key=>key===overviewBenchmarkStorageKey('owner')?JSON.stringify(hidden):null};
 assert.equal(overviewSeriesVisible(readOverviewBenchmarks(storage,'owner'),'actual'),false);
 assert.equal(overviewSeriesVisible(readOverviewBenchmarks(storage,'other'),'actual'),true);
 const allHidden=toggleOverviewBenchmark(hidden,'BTC');
 assert.equal(overviewSeriesVisible(allHidden,'actual'),false);
 assert.equal(overviewSeriesVisible(allHidden,'BTC'),false);
 assert.deepEqual(toggleOverviewBenchmark(hidden,'actual'),original);
 });
