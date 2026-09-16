import test from 'node:test';
import assert from 'node:assert/strict';
import { instrumentFor, marketEntry, convertAmount } from '../lib/market.ts';
const entry = { id:'a', kind:'Crypto', name:'Bitcoin (BTC)', currency:'UZS', amount:100000, cost:90000, quantity:2 };
test('identifies coins and rejects ambiguous stock names', () => {
 assert.deepEqual(instrumentFor(entry), { kind:'Crypto', symbol:'BTC' });
 assert.equal(instrumentFor({kind:'Stock',name:'Apple Inc'}), null);
 assert.deepEqual(instrumentFor({kind:'Stock',name:'AAPL'}), {kind:'Stock',symbol:'AAPL'});
});
test('converts fetched prices and saved cost without mutating records', () => {
 const market={fx:{rate:10000},quotes:{'Crypto:BTC':{usd:12}},errors:{}};
 const result=marketEntry(entry,'USD',market);
 assert.equal(result.amount,12);assert.equal(result.cost,9);assert.equal(result.quantity,2);
 assert.equal(entry.amount,100000);assert.equal(entry.currency,'UZS');
 assert.equal(marketEntry(entry,'UZS',market).amount,120000);
});
test('feed failures retain saved values and never mix currencies', () => {
 assert.equal(marketEntry(entry,'UZS',null).amount,100000);
 assert.equal(marketEntry(entry,'USD',null),null);
 assert.equal(marketEntry(entry,'UZS',{fx:null,quotes:{'Crypto:BTC':{usd:12}}}).amount,100000);
 assert.equal(convertAmount(10,'USD','UZS',0),null);
 assert.equal(convertAmount(10000,'UZS','USD',10000),1);
});
