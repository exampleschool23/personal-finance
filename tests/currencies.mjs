import test from 'node:test';
import assert from 'node:assert/strict';
import { fiatCurrencies, isCurrency } from '../lib/currencies.ts';
import { formatMoney } from '../lib/format.ts';
import { convertAmount, marketEntry } from '../lib/market.ts';
test('fiat catalogue excludes metals and supports common and minor currencies',()=>{
 assert.equal(new Set(fiatCurrencies.map(c=>c.code)).size,fiatCurrencies.length);
 for(const code of ['USD','UZS','EUR','GBP','JPY','KWD','RUB']) assert(isCurrency(code));
 for(const code of ['BTC','XAU','XXX','ZZZ']) assert(!isCurrency(code));
 assert.equal(formatMoney(1234.5,'JPY','en-US'),'¥1,235');
 assert.equal(formatMoney(1.234,'KWD','en-US'),'KWD 1.234');
});
test('cross-currency conversions are USD-relative and never assume missing rates',()=>{
 const rates={USD:1,EUR:.8,GBP:.5,UZS:12000};
 assert.equal(convertAmount(80,'EUR','GBP',rates),50);
 assert.equal(convertAmount(50,'GBP','UZS',rates),1200000);
 assert.equal(convertAmount(10,'JPY','EUR',rates),null);
 assert.equal(convertAmount(10,'JPY','JPY',rates),10);
 const record={id:'x',name:'Bitcoin (BTC)',kind:'Crypto',currency:'EUR',amount:80,cost:40,quantity:2};
 const converted=marketEntry(record,'GBP',{rates,fx:null,quotes:{'Crypto:BTC':{usd:120}}});
 assert.equal(converted.amount,60);assert.equal(converted.cost,25);assert.equal(record.cost,40);
});
