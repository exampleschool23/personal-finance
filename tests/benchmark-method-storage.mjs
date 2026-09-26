import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {readBenchmarkMethod,benchmarkMethodStorageKey}=loadTS('lib/investment-benchmarks.ts');
const storage=value=>({getItem:key=>key===benchmarkMethodStorageKey('owner')?value:null});
test('saved comparison methods without a funding scope keep excluding expenses',()=>{
 assert.deepEqual(readBenchmarkMethod(storage(JSON.stringify({mode:'date',date:'2026-09-01'})),'owner','2026-09-26'),{mode:'date',date:'2026-09-01',scope:'investments'});
 assert.deepEqual(readBenchmarkMethod(storage(JSON.stringify({mode:'purchases',date:'2026-09-01',scope:'expenses'})),'owner','2026-09-26'),{mode:'purchases',date:'2026-09-01',scope:'expenses'});
});
test('invalid, future, foreign-owner or corrupt saved methods are ignored',()=>{
 for(const value of [JSON.stringify({mode:'date',date:'2026-09-27'}),JSON.stringify({mode:'date',date:'2026-02-30'}),JSON.stringify({mode:'other',date:'2026-09-01'}),JSON.stringify({mode:'date',date:'2026-09-01',scope:'everything'}),'{',null])
  assert.equal(readBenchmarkMethod(storage(value),'owner','2026-09-26'),null,String(value));
 assert.equal(readBenchmarkMethod(storage(JSON.stringify({mode:'date',date:'2026-09-01'})),'someone-else','2026-09-26'),null);
});
