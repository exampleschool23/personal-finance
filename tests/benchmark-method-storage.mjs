import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {readBenchmarkScope,benchmarkMethodStorageKey}=loadTS('lib/investment-benchmarks.ts');
const storage=value=>({getItem:key=>key===benchmarkMethodStorageKey('owner')?value:null});
test('saved funding scopes survive, and older choices without a scope keep excluding expenses',()=>{
 assert.equal(readBenchmarkScope(storage(JSON.stringify({scope:'expenses'})),'owner'),'expenses');
 // Choices saved before the tracking start moved to the account still carry their scope.
 assert.equal(readBenchmarkScope(storage(JSON.stringify({mode:'purchases',date:'2026-09-01',scope:'expenses'})),'owner'),'expenses');
 assert.equal(readBenchmarkScope(storage(JSON.stringify({mode:'date',date:'2026-09-01'})),'owner'),'investments');
});
test('invalid, foreign-owner or corrupt saved scopes are ignored',()=>{
 for(const value of [JSON.stringify({scope:'everything'}),JSON.stringify('expenses'),'{',null])
  assert.equal(readBenchmarkScope(storage(value),'owner'),null,String(value));
 assert.equal(readBenchmarkScope(storage(JSON.stringify({scope:'expenses'})),'someone-else'),null);
});
