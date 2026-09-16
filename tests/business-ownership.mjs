import test from 'node:test';
import assert from 'node:assert/strict';
import { value } from '../lib/finance.ts';
import { marketEntry } from '../lib/market.ts';
test('business values reflect ownership without changing other asset types',()=>{
 const business={kind:'Business',amount:55000,ownership_percentage:40};
 assert.equal(value(business),22000);
 assert.equal(value({...business,ownership_percentage:0}),0);
 assert.equal(value({...business,ownership_percentage:undefined}),55000);
 assert.equal(value({...business,kind:'Cash'}),55000);
 assert.equal(value({...business,kind:'Stock',quantity:2}),110000);
});
test('currency conversion and ownership apply once',()=>{
 const business={id:'b',kind:'Business',name:'Cafe',amount:55000,cost:0,currency:'USD',ownership_percentage:40};
 const converted=marketEntry(business,'UZS',{fx:{rate:12000},quotes:{}});
 assert.equal(value(converted),264000000);assert.equal(business.amount,55000);
});
