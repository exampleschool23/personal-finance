import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {parseTypedEntry,guessCategory,looseNumber,currencyCandidates}=loadTS('lib/telegram-entry.ts');
const {translate}=loadTS('lib/i18n.ts');
const today='2026-09-30';
const accounts=[{id:'card',name:'Card',kind:'Cash'},{id:'card2',name:'Card 2',kind:'Cash'},{id:'wallet',name:'Wallet',kind:'Cash'},{id:'btc',name:'Bitcoin',kind:'Crypto'}];
const ctx=(language='en',currencies=['USD','UZS'])=>({language,today,accounts,currencies});
const parse=(text,language,currencies)=>parseTypedEntry(text,ctx(language,currencies));

test('amount first or last, with an optional currency code, symbol or word from the owner\'s currencies',()=>{
 assert.deepEqual(parse('coffee 4.5'),{amount:4.5,date:today,name:'coffee'});
 assert.deepEqual(parse('4.5 coffee'),{amount:4.5,date:today,name:'coffee'});
 assert.deepEqual(parse('taxi 25000 uzs'),{amount:25000,currency:'UZS',date:today,name:'taxi'});
 assert.deepEqual(parse('taxi 25 000 UZS'),{amount:25000,currency:'UZS',date:today,name:'taxi'},'digits grouped by spaces are one amount');
 assert.deepEqual(parse('$4.50 coffee'),{amount:4.5,currency:'USD',date:today,name:'coffee'});
 assert.deepEqual(parse('coffee 4.50$'),{amount:4.5,currency:'USD',date:today,name:'coffee'});
 assert.deepEqual(parse('usd 12 lunch'),{amount:12,currency:'USD',date:today,name:'lunch'});
 assert.deepEqual(parse('кофе 15 000 сум'),{amount:15000,currency:'UZS',date:today,name:'кофе'});
 assert.deepEqual(parse("non 8000 so'm",'uz'),{amount:8000,currency:'UZS',date:today,name:'non'});
});

test('a currency the owner does not use is asked about, and a shared symbol follows their own currencies',()=>{
 assert.deepEqual(parse('lunch 12 eur'),{amount:12,currencyChoices:['EUR'],date:today,name:'lunch'});
 assert.deepEqual(parse('12€ lunch'),{amount:12,currencyChoices:['EUR'],date:today,name:'lunch'});
 // "$" means the one dollar currency the owner keeps; with none, the bot asks.
 assert.equal(parse('5$ tip','en',['CAD','EUR']).currency,'CAD');
 assert.ok(parse('5$ tip','en',['EUR','UZS']).currencyChoices.includes('USD'));
 assert.equal(currencyCandidates('abc'),null);assert.deepEqual(currencyCandidates('Eur'),['EUR']);
});

test('signs and decimals: + is income, − is expense, and separators follow the language when ambiguous',()=>{
 assert.deepEqual(parse('+1500 salary'),{direction:'income',amount:1500,date:today,name:'salary'});
 assert.deepEqual(parse('-20 taxi'),{direction:'expense',amount:20,date:today,name:'taxi'});
 assert.equal(parse('1,500 rent').amount,1500,'English groups with commas');
 assert.equal(parse('кофе 1,500','ru').amount,1.5,'Russian writes decimals with a comma');
 assert.equal(parse('кофе 1.500','ru').amount,1500);
 assert.equal(parse('qahva 4,5','uz').amount,4.5);
 assert.equal(parse('rent 1,234,567.89').amount,1234567.89);
 assert.equal(parse('rent 1.234.567,89','de').amount,1234567.89);
 assert.equal(looseNumber('0.000001','en'),0.000001,'precision is kept; only display rounds');
 for(const bad of ['0','1,2,3','12.','1.2.3,4.5'])assert.equal(looseNumber(bad,'en'),null,bad);
 assert.equal(looseNumber('2000000000000000','en'),null,'over the app limit');
});

test('today, yesterday and typed dates in the bot languages; a future or second date is refused',()=>{
 assert.equal(parse('lunch 12 eur yesterday').date,'2026-09-29');
 assert.equal(parse('lunch 12 day before yesterday').date,'2026-09-28');
 assert.equal(parse('кофе 3 вчера','ru').date,'2026-09-29');assert.equal(parse('кофе 3 позавчера','ru').date,'2026-09-28');
 assert.equal(parse('qahva 3 kecha','uz').date,'2026-09-29');assert.equal(parse('qahva 3 bugun','uz').date,today);
 assert.equal(parse(`café 3 ${translate('es','Yesterday')}`,'es').date,'2026-09-29');
 assert.equal(parse('coffee 3 2026-09-01').date,'2026-09-01');
 assert.equal(parse('coffee 3 01.09.2026').date,'2026-09-01');
 assert.equal(parse('coffee 3 2026-09-01').name,'coffee','the date is not part of the name');
 assert.deepEqual(parse('coffee 3 2026-10-05'),{error:'date'});
 assert.deepEqual(parse('coffee 3 today yesterday'),{error:'date'});
 assert.deepEqual(parse('coffee 3 2026-02-30'),{error:'date'});
});

test('a cash account named in the text is used, the longest name first, and holdings are never accounts',()=>{
 assert.deepEqual(parse('groceries 30 card'),{amount:30,date:today,name:'groceries',account_id:'card'});
 assert.equal(parse('groceries 30 Card 2').account_id,'card2');
 assert.equal(parse('lunch 10 from wallet').account_id,'wallet');assert.equal(parse('lunch 10 from wallet').name,'lunch');
 assert.equal(parse('bitcoin 10').account_id,undefined);
});

test('text without exactly one amount is not an entry',()=>{
 for(const text of ['hello','','   ','coffee','iphone 15 1200'])assert.deepEqual(parse(text),{error:text.trim()?'amount':'empty'},text);
 assert.equal(parse('iphone 15 1200 usd').amount,1200,'the number beside a currency is the amount');
 assert.equal(parse('iphone 15 $1200').amount,1200);
 assert.deepEqual(parse('x'.repeat(130)+' 5'),{error:'empty'},'names stay under 120 characters');
});

const rule=(over)=>({id:'r',pattern:'coffee',match:'contains',direction:'expense',account_id:null,match_business_id:null,match_kind:null,match_category_id:null,amount_min:null,amount_max:null,kind:'Other expense',category_id:'cafe',business_id:null,tag_ids:[],created_at:'2026-01-01',...over});
const record=(over)=>({id:'x',name:'Coffee',kind:'Charity',custom_category_id:null,frequency:'Once',date:'2026-09-01',amount:3,currency:'USD',quantity:0,cost:0,rate:0,notes:'',...over});
const categories=[{id:'cafe',name:'Cafes',direction:'expense'},{id:'groc',name:'Groceries',direction:'expense'},{id:'tips',name:'Tips',direction:'income'}];

test('the category comes from rules first, then the last record with that name, then a named category, then keywords',()=>{
 const history=[record({date:'2026-08-01',kind:'Living expense'}),record({date:'2026-09-01',account_id:'wallet'})];
 // The newest matching rule wins, as when imports are classified.
 const rules=[rule({id:'old',category_id:'groc',created_at:'2025-01-01'}),rule({id:'new',created_at:'2026-01-01',business_id:'shop'})];
 assert.deepEqual(guessCategory({name:'Morning coffee',amount:4},{rules,records:history,categories,businesses:[{id:'shop'}]}),{direction:'expense',kind:'Other expense',custom_category_id:'cafe',business_id:'shop',source:'rule'});
 // A rule limited to an amount range or another account does not apply.
 assert.equal(guessCategory({name:'coffee',amount:50},{rules:[rule({amount_max:10})],records:[],categories}).source,'keyword');
 assert.equal(guessCategory({name:'coffee',amount:5,account_id:'card'},{rules:[rule({account_id:'wallet'})],records:[],categories}).source,'keyword');
 // History: the most recent one-time record with the same name, any case, and its account.
 assert.deepEqual(guessCategory({name:'coffee',amount:4},{records:history,categories}),{direction:'expense',kind:'Charity',custom_category_id:null,account_id:'wallet',source:'history'});
 assert.equal(guessCategory({name:'coffee',amount:4},{records:[record({frequency:'Monthly'})],categories}).source,'keyword','scheduled records are not history');
 assert.deepEqual(guessCategory({name:'groceries',amount:30},{records:[],categories}),{direction:'expense',kind:'Other expense',custom_category_id:'groc',source:'category'});
 assert.equal(guessCategory({name:'tips',amount:30},{records:[],categories}).direction,'income');
});

test('the keyword table reads English, Russian and Uzbek, and a typed sign fixes the direction',()=>{
 const guess=(name,direction)=>{const result=guessCategory({name,amount:5,direction},{records:[],categories:[]});return [result.direction,result.kind];};
 for(const name of ['coffee','Lunch','taxi','кофе','Продукты','в аптеке','qahva','oziq-ovqat','taksi'])assert.deepEqual(guess(name),['expense','Living expense'],name);
 for(const name of ['salary','зарплата','maosh','oylik'])assert.deepEqual(guess(name),['income','Salary'],name);
 assert.deepEqual(guess('rent'),['expense','Rent expense']);assert.deepEqual(guess('аренда'),['expense','Rent expense']);
 assert.deepEqual(guess('donation'),['expense','Charity']);assert.deepEqual(guess('xayriya'),['expense','Charity']);
 assert.deepEqual(guess('freelance'),['income','Other income']);
 assert.deepEqual(guess('business trip'),['expense','Other expense'],'"bus" never matches "business"');
 assert.deepEqual(guess(''),['expense','Other expense']);
 assert.deepEqual(guess('',  'income'),['income','Other income']);
 assert.deepEqual(guess('coffee','income'),['income','Other income'],'+ coffee is income');
 assert.deepEqual(guess('salary','expense'),['expense','Other expense']);
});

test('business income is guessed only with a business the owner still has',()=>{
 const past=[record({name:'Cafe sales',kind:'Business income',business_id:'gone'})];
 assert.notEqual(guessCategory({name:'cafe sales',amount:5},{records:past,categories:[],businesses:[]}).source,'history');
 assert.equal(guessCategory({name:'cafe sales',amount:5},{records:past,categories:[],businesses:[{id:'gone'}]}).kind,'Business income');
 assert.equal(guessCategory({name:'cafe',amount:5},{rules:[rule({pattern:'cafe',direction:'income',kind:'Business income',category_id:null,business_id:null})],records:[],categories:[]}).source,'keyword');
});

test('every amount the bot asks for is read by one parser, in setup and in records alike',()=>{
 const {parseTypedAmount}=loadTS('lib/telegram-entry.ts');
 // 1.000 is a thousand where the dot groups digits and one where it is the decimal mark; 1,5 is one and a half everywhere.
 assert.equal(parseTypedAmount('1.000','ru'),1000);assert.equal(parseTypedAmount('1.000','de'),1000);assert.equal(parseTypedAmount('1.000','en'),1);
 for(const language of ['en','ru','de','fr'])assert.equal(parseTypedAmount('1,5',language),1.5,language);
 for(const text of ['1 000',' 1 000 ','1 000','1 000'])assert.equal(parseTypedAmount(text,'ru'),1000,JSON.stringify(text));
 // Zero only where an empty account or no interest is a real answer.
 assert.equal(parseTypedAmount('0','en'),null);
 for(const text of ['0','0,00','0.0'])assert.equal(parseTypedAmount(text,'en',{allowZero:true}),0,text);
 for(const text of ['','abc','-5','1e99','12.','1,2,3'])assert.equal(parseTypedAmount(text,'en',{allowZero:true}),null,text);
 // The setup's opening balance and the record flow agree on the same text.
 const {advanceOnboarding}=loadTS('lib/telegram-onboarding.ts');
 const balance={kind:'onboard',step:'balance',data:{currency:'EUR',account_name:'Wallet'}};
 for(const [text,language,amount] of [['1.000','ru',1000],['1,5','en',1.5],['1 000','en',1000],['0','en',0]])assert.equal(advanceOnboarding(balance,{text},{language},1).effects.account.amount,amount,text);
});

test('a date typed the way the bot writes it (its own example) is read as the date, in the owner\'s language or English',()=>{
 // Review BOT-006: the bot asked for "9 October 2026" but read its digits as amounts or kept them in the name.
 assert.deepEqual(parse('coffee 4.5 9 September 2026'),{amount:4.5,date:'2026-09-09',name:'coffee'});
 assert.deepEqual(parse('coffee $4.5 9 September 2026'),{amount:4.5,currency:'USD',date:'2026-09-09',name:'coffee'});
 assert.deepEqual(parse('9 September 2026 taxi 25 000 uzs'),{amount:25000,currency:'UZS',date:'2026-09-09',name:'taxi'});
 assert.deepEqual(parse('кофе 4,5 9 сентября 2026','ru'),{amount:4.5,date:'2026-09-09',name:'кофе'});
 assert.deepEqual(parse('кофе 4,5 9 September 2026','ru'),{amount:4.5,date:'2026-09-09',name:'кофе'},'English is understood in every language');
 assert.deepEqual(parse('qahva 4,5 9 sentabr 2026','uz'),{amount:4.5,date:'2026-09-09',name:'qahva'});
 assert.deepEqual(parse('café 4,5 9 de septiembre de 2026','es'),{amount:4.5,date:'2026-09-09',name:'café'});
 // A future day, or two dates, is refused rather than guessed; a month name alone is just a name.
 assert.deepEqual(parse('coffee 4.5 9 October 2026'),{error:'date'});
 assert.deepEqual(parse('coffee 4.5 9 September 2026 yesterday'),{error:'date'});
 assert.deepEqual(parse('coffee 4.5 2026-09-01 9 September 2026'),{error:'date'});
 assert.deepEqual(parse('September rent 900'),{amount:900,date:today,name:'September rent'});
});
