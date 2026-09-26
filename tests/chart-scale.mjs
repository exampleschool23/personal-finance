import test from 'node:test';
import assert from 'node:assert/strict';
import {niceAxis} from '../lib/chart-scale.ts';
test('money axes use round ticks and never show negative values for non-negative data',()=>{
 assert.deepEqual(niceAxis([49645,3105952]),{domain:[0,4000000],ticks:[0,1000000,2000000,3000000,4000000]});
 assert.deepEqual(niceAxis([148480,901509]).ticks,[0,250000,500000,750000,1000000]);
 for(const values of [[1000],[],[0,0],[12.5,13.2],[900000,901000]]){
  const {domain,ticks}=niceAxis(values);
  assert.ok(ticks[0]>=0,JSON.stringify(values));assert.ok(domain[1]>domain[0]);
  for(const value of values)assert.ok(value>=domain[0]&&value<=domain[1]);
 }
});
test('negative data keeps a zero line and covers the full range',()=>{
 const {domain,ticks}=niceAxis([-500,1200]);
 assert.ok(ticks.includes(0));assert.ok(domain[0]<=-500&&domain[1]>=1200);
});
