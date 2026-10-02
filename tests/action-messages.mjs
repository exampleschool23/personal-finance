import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {actionMessage,referencedIds}=loadTS('lib/action-messages.ts');
const lookup={
 records:{cash:{name:'Wallet <main>',kind:'Cash',currency:'UZS'},card:{name:'Card',kind:'Cash',currency:'USD'},loan:{name:'Car loan',kind:'Loan',currency:'USD'},house:{name:'Flat',kind:'Mortgage',currency:'UZS'},rent:{name:'Rent',kind:'Rent expense',currency:'UZS'},btc:{name:'Bitcoin',kind:'Crypto',currency:'USD'}},
 goals:{trip:{name:'Trip',currency:'USD'}},
 deleted:{gone:{name:'Old phone',kind:'Other expense',currency:'UZS',amount:1500000.75}},
};

test('record messages name the kind, escape the name, show whole amounts and dates in every language',()=>{
 const event={type:'record',created:true,kind:'Living expense',name:'Groceries & <bread>',amount:250000.4,currency:'UZS',date:'2026-09-30',frequency:'Once'};
 assert.equal(actionMessage(event,lookup,'en'),'Added Living expense\n<b>Groceries &amp; &lt;bread&gt;</b> · UZS 250,000 · 30 September 2026');
 assert.match(actionMessage(event,lookup,'ru'),/^Добавлено: Бытовые расходы\n<b>Groceries &amp; &lt;bread&gt;<\/b> · 250 000 UZS · 30 сентября 2026$/);
assert.match(actionMessage(event,lookup,'uz'),/^Qo‘shildi: Kundalik xarajatlar\n<b>Groceries &amp; &lt;bread&gt;<\/b> · 250\s000\sso.m · 30 sentabr 2026$/);
 assert.equal(actionMessage({...event,created:false,frequency:'Monthly',date:null},lookup,'en'),'Updated Living expense\n<b>Groceries &amp; &lt;bread&gt;</b> · UZS 250,000 · Monthly');
 assert.ok(!actionMessage(event,lookup,'en').includes('250000.4'));

 // A record in a custom category is named by the category, escaped, rather than its stored Other expense kind; an unknown category falls back to the kind.
 const custom={...event,kind:'Other expense',name:'Latte',category_id:'coffee'};
 assert.match(actionMessage(custom,{...lookup,categories:{coffee:'QA <Coffee>'}},'en'),/^Added QA &lt;Coffee&gt;\n<b>Latte<\/b>/);
 assert.match(actionMessage(custom,lookup,'en'),/^Added Other expense\n/);
});

test('deleted records are described from the recycle bin copy, or generically when it is missing',()=>{
 assert.equal(actionMessage({type:'record_deleted',id:'gone'},lookup,'en'),'Deleted Other expense\n<b>Old phone</b> · UZS 1,500,001');
 assert.equal(actionMessage({type:'record_deleted',id:'missing'},lookup,'en'),'Deleted a record');
 assert.deepEqual(referencedIds({type:'record_deleted',id:'gone'}),{records:[],goals:[],deleted:['gone']});
});

test('payments, repayments and mortgage payments use the target currency and name the account',()=>{
 assert.equal(actionMessage({type:'occurrence',account_id:'cash',target_id:'rent',amount:3000000,date:'2026-10-01'},lookup,'en'),'Payment recorded\n<b>Rent</b> · UZS 3,000,000 · 1 October 2026 · from Wallet &lt;main&gt;');
 assert.equal(actionMessage({type:'repayment',account_id:'card',target_id:'loan',amount:400,date:'2026-10-01'},lookup,'en'),'Repayment recorded\n<b>Car loan</b> · $400 · 1 October 2026 · from Card');
 assert.equal(actionMessage({type:'mortgage',account_id:'cash',target_id:'house',principal:5000000,interest:1200000,date:'2026-10-01'},lookup,'en'),'Mortgage payment recorded\n<b>Flat</b> · principal UZS 5,000,000 · interest UZS 1,200,000 · 1 October 2026 · from Wallet &lt;main&gt;');
 assert.deepEqual(referencedIds({type:'mortgage',account_id:'cash',target_id:'house',principal:1,interest:0,date:'2026-10-01'}),{records:['cash','house'],goals:[],deleted:[]});
 assert.match(actionMessage({type:'occurrence',account_id:'nope',target_id:'nope',amount:1,date:'2026-10-01'},lookup,'en'),/Unknown record/);
});

test('transfers show both amounts only across currencies; reconciliations, exceptions and dismissals are short',()=>{
 assert.equal(actionMessage({type:'transfer',account_id:'card',target_id:'cash',amount:100,received:1250000,date:'2026-10-01'},lookup,'en'),'Transfer recorded\n<b>Card</b> → <b>Wallet &lt;main&gt;</b> · $100 → UZS 1,250,000 · 1 October 2026');
 assert.equal(actionMessage({type:'transfer',account_id:'card',target_id:'card',amount:100,received:100,date:'2026-10-01'},lookup,'en'),'Transfer recorded\n<b>Card</b> → <b>Card</b> · $100 · 1 October 2026');
 assert.equal(actionMessage({type:'reconcile',account_id:'cash',amount:900000,date:'2026-10-01'},lookup,'en'),'Balance reconciled\n<b>Wallet &lt;main&gt;</b> · UZS 900,000 · 1 October 2026');
 assert.equal(actionMessage({type:'exception',target_id:'rent',date:'2026-10-01',skip:true},lookup,'en'),'Scheduled payment skipped\n<b>Rent</b> · 1 October 2026');
 assert.equal(actionMessage({type:'exception',target_id:'rent',date:'2026-10-01',skip:false},lookup,'en'),'Scheduled payment restored\n<b>Rent</b> · 1 October 2026');
 assert.equal(actionMessage({type:'dismiss',target_id:'rent',date:'2026-10-01'},lookup,'en'),'Payment dismissed\n<b>Rent</b> · 1 October 2026');
});

test('goal messages resolve the goal name and currency',()=>{
 assert.equal(actionMessage({type:'goal',name:'Trip',target:2000,currency:'USD'},lookup,'en'),'Goal saved\n<b>Trip</b> · target $2,000');
 assert.equal(actionMessage({type:'goal_deleted'},lookup,'ru'),'Цель удалена');
 assert.equal(actionMessage({type:'goal_activity',goal_id:'trip',activity:'contribution',amount:150,date:'2026-10-01'},lookup,'en'),'Goal contribution\n<b>Trip</b> · $150 · 1 October 2026');
 assert.equal(actionMessage({type:'goal_activity',goal_id:'trip',activity:'withdrawal',amount:50,date:'2026-10-01'},lookup,'en'),'Goal withdrawal\n<b>Trip</b> · $50 · 1 October 2026');
 assert.equal(actionMessage({type:'goal_funding',goal_id:'trip',monthly:200,enabled:true},lookup,'en'),'Goal funding updated\n<b>Trip</b> · $200 per month');
 assert.equal(actionMessage({type:'goal_funding',goal_id:'trip',monthly:200,enabled:false},lookup,'en'),'Goal funding updated\n<b>Trip</b> · Funding paused');
 assert.deepEqual(referencedIds({type:'goal_funding',goal_id:'trip',monthly:null,enabled:true}),{records:[],goals:['trip'],deleted:[]});
});

test('asset movements show units for holdings and money for cash',()=>{
 assert.equal(actionMessage({type:'movement',kind:'buy',source_id:'card',target_id:'btc',sent:1000,received:0.0125,date:'2026-10-01'},lookup,'en'),'Purchase recorded\n<b>Bitcoin</b> · 0.0125 · for $1,000 · from Card · 1 October 2026');
 assert.equal(actionMessage({type:'movement',kind:'sell',source_id:'btc',target_id:'card',sent:0.01,received:800,date:'2026-10-01'},lookup,'en'),'Sale recorded\n<b>Bitcoin</b> · 0.01 · for $800 · to Card · 1 October 2026');
 assert.equal(actionMessage({type:'movement',kind:'interest',source_id:'cash',target_id:'cash',sent:0,received:12000,date:'2026-10-01'},lookup,'en'),'Interest recorded\n<b>Wallet &lt;main&gt;</b> · UZS 12,000 · 1 October 2026');
 assert.equal(actionMessage({type:'movement',kind:'transfer',source_id:'card',target_id:'cash',sent:100,received:1250000,date:'2026-10-01'},lookup,'en'),'Holdings transferred\n<b>Card</b> → <b>Wallet &lt;main&gt;</b> · $100 · 1 October 2026');
});

test('imports report counts through the shared number formatter',()=>{
 assert.equal(actionMessage({type:'import',added:1200,skipped:3},lookup,'en'),'Statement imported\n1,200 added · 3 skipped');
 assert.match(actionMessage({type:'import',added:1200,skipped:3},lookup,'ru'),/1 200/);
});
