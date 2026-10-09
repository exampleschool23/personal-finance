import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {convertAmount,marketRates,marketEntry}=loadTS('lib/market.ts');
const {convertMoney,amountIn}=loadTS('lib/money.ts');

// Every shape the market feed's rates arrive in: the USD table (with and without USD itself), the older single UZS rate,
// a table with unusable entries, and nothing at all.
const markets=[
 {rates:{USD:1,UZS:12500,EUR:.9},fx:null},
 {rates:{UZS:12500,EUR:.9},fx:null},
 {rates:{USD:2,UZS:12500},fx:null},
 {fx:{rate:12600,date:'2026-10-01',source:'CBU'}},
 {rates:{UZS:12500,EUR:0,GBP:-1,JPY:Number.NaN},fx:{rate:12600,date:'2026-10-01',source:'CBU'}},
 {rates:undefined,fx:null},
 null,
];
const currencies=['USD','UZS','EUR','GBP','JPY','XYZ'];

test('convertAmount and convertMoney agree on every rate table shape once it is read through marketRates',()=>{
 for(const market of markets)for(const from of currencies)for(const to of currencies)for(const amount of [0,1,1234.5678,-50]){
  const legacy=convertAmount(amount,from,to,market?.rates??market?.fx?.rate);
  const shared=convertAmount(amount,from,to,marketRates(market));
  const money=amountIn({amount,currency:from},to,marketRates(market));
  assert.equal(shared,legacy,`convertAmount ${amount} ${from}→${to} with ${JSON.stringify(market)}`);
  assert.equal(money,legacy,`convertMoney ${amount} ${from}→${to} with ${JSON.stringify(market)}`);
  if(legacy!==null)assert.deepEqual(convertMoney({amount,currency:from},to,marketRates(market)),{amount:legacy,currency:to});
 }
});

test('marketRates always prices USD at 1, reads the older UZS rate, and keeps one table per feed',()=>{
 assert.deepEqual(marketRates({rates:{UZS:12500},fx:null}),{UZS:12500,USD:1});
 assert.deepEqual(marketRates({fx:{rate:12600,date:'2026-10-01',source:'CBU'}}),{USD:1,UZS:12600});
 assert.equal(marketRates(null),undefined);assert.equal(marketRates({fx:null}),undefined);
 const market={rates:{UZS:12500},fx:null};
 assert.equal(marketRates(market),marketRates(market),'the same feed gives the same table, so React memos keep');
 // A USD-quoted holding values the same through the table as through the bare rate it replaced.
 const coin={id:'b',name:'Bitcoin',kind:'Crypto',currency:'USD',amount:1,quantity:1,cost:100,rate:0,date:'2026-01-01',frequency:'Once',notes:''};
 const quotes={'Crypto:BTC':{usd:60000,source:'test',fetchedAt:'2026-10-01'}};
 assert.equal(marketEntry(coin,'UZS',{fx:{rate:12600,date:'2026-10-01',source:'CBU'},quotes,errors:{},stocksConfigured:false}).amount,60000*12600);
 assert.equal(marketEntry(coin,'EUR',{fx:{rate:12600,date:'2026-10-01',source:'CBU'},quotes,errors:{},stocksConfigured:false}),null,'no EUR rate, no guessed value');
});
