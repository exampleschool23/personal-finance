import test from 'node:test';
import assert from 'node:assert/strict';
import { currencyFromText, currencyMatches, fiatCurrencies, isCurrency, replacePreferredCurrency, togglePreferredCurrency } from '../lib/currencies.ts';
import { formatMoney } from '../lib/format.ts';
import { convertAmount, marketEntry } from '../lib/market.ts';
test('fiat catalogue excludes metals and supports common and minor currencies',()=>{
 assert.equal(new Set(fiatCurrencies.map(c=>c.code)).size,fiatCurrencies.length);
 for(const code of ['USD','UZS','EUR','GBP','JPY','KWD','RUB']) assert(isCurrency(code));
 for(const code of ['BTC','XAU','XXX','ZZZ']) assert(!isCurrency(code));
 assert.equal(formatMoney(1234.5,'JPY','en-US'),'¥1,235');
 assert.equal(formatMoney(1.234,'KWD','en-US'),'KWD 1');
 assert.equal(formatMoney(1.234,'KWD','en-US',true),'KWD 1.234');
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
test('preferred currency taps explain the limit instead of being ignored',()=>{
 assert.deepEqual(togglePreferredCurrency(['USD'],'UZS'),{currencies:['USD','UZS']});
 assert.deepEqual(togglePreferredCurrency(['USD','UZS'],'UZS'),{currencies:['USD']});
 assert.deepEqual(togglePreferredCurrency(['USD','UZS'],'AUD'),{blocked:'full'});
 assert.deepEqual(togglePreferredCurrency(['USD'],'USD'),{blocked:'last'});
 assert.deepEqual(replacePreferredCurrency(['USD','UZS'],'USD','AUD'),['AUD','UZS']);
 assert.deepEqual(replacePreferredCurrency(['USD','UZS'],'UZS','AUD'),['USD','AUD']);
});

test('currency search matches codes and names in the chosen language or English, ignoring case and accents',()=>{
 assert.equal(currencyMatches('',  'en-US').length,fiatCurrencies.length);
 assert.deepEqual(currencyMatches('  ','en-US'),fiatCurrencies.map(c=>c.code));
 assert.ok(currencyMatches('eur','en-US').includes('EUR'),'by code, ignoring case');
 assert.ok(currencyMatches('yen','en-US').includes('JPY'),'by English name');
 assert.ok(currencyMatches('cordoba','en-US').includes('NIO'),'accents are folded');
 assert.ok(currencyMatches('zloty','en-US').includes('PLN'),'ł folds to l');
 assert.ok(currencyMatches('Euro','ru-RU').includes('EUR'),'the English name still matches in another language');
 assert.ok(currencyMatches('евро','ru-RU').includes('EUR'),'the localized name matches');
 assert.deepEqual(currencyMatches('no such money','en-US'),[]);
 assert.equal(currencyFromText('EUR · Euro'),'EUR');assert.equal(currencyFromText(' usd '),'USD');
 assert.equal(currencyFromText('BTC'),null);assert.equal(currencyFromText('Euro'),null);
});
