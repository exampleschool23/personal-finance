import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';

// The confirmation card and the commit of every kind of conversation, built straight from a draft.
const {summary}=loadTS('lib/telegram-flow/summary.ts');
const {commitFor}=loadTS('lib/telegram-flow/commit.ts');
const {recordSchema}=loadTS('lib/record-schema.ts');
const {formatMoney}=loadTS('lib/format.ts');
const usd=value=>formatMoney(value,'USD','en-US'),eur=value=>formatMoney(value,'EUR','en-US');
const entry=(id,name,kind,amount,currency='USD',extra={})=>({id,name,kind,amount,currency,quantity:0,cost:0,rate:0,date:'2026-01-01',frequency:'Once',notes:'',...extra});
const ctx={language:'en',today:'2026-09-30',newId:'77000000-0000-4000-8000-000000000099',categories:[],
 accounts:[entry('card','Card','Cash',500),entry('euro','Euro cash','Cash',300,'EUR'),entry('shop','Shop till','Cash',80,'USD',{business_id:'biz'})],
 liabilities:[entry('loan','Car loan','Loan',2000),entry('flat','Flat','Mortgage',90000,'EUR')],
 businesses:[entry('biz','Bakery','Business',0)]};
const draft=(kind,data)=>({kind,step:'confirm',data});

test('the card names what is saved, in the account currency too when it converts, and the business it carries',()=>{
 const plain=summary(draft('expense',{category_name:'Groceries',name:'',amount:12,account_id:'card',date:'2026-09-29'}),ctx);
 assert.equal(plain,['<b>Save this?</b>','Expense · Groceries',`<b>Groceries</b> · ${usd(12)} · 29 September 2026`,'from Card'].join('\n'));
 const converted=summary(draft('income',{category_name:'Salary',name:'Pay',amount:100,currency:'EUR',fx_rate:0.5,account_id:'shop'}),ctx);
 assert.match(converted,/Income · Salary\n<b>Pay<\/b> · €100 · 30 September 2026\ninto Shop till · ≈ \$200\n1 EUR = 2 USD\nBusiness: Bakery/);
 // "No business" chosen here wins over the account's own.
 assert.doesNotMatch(summary(draft('expense',{category_name:'Rent',amount:5,account_id:'shop',business_id:null}),ctx),/Business/);
 assert.match(summary(draft('expense',{account_id:'card'}),ctx),/Expense · \n<b><\/b> · \$0 · 30 September 2026\nfrom Card$/,'a draft without a category or amount still reads');
 assert.equal(summary(draft('transfer',{account_id:'card',target_id:'euro',amount:50,received:45}),ctx).split('\n').slice(1).join('\n'),`Transfer · <b>Card</b> → <b>Euro cash</b>\n${usd(50)} → ${eur(45)} · 30 September 2026`);
 assert.match(summary(draft('transfer',{account_id:'card',target_id:'shop',amount:50}),ctx),/\$50 · 30/,'one currency shows one amount');
 assert.match(summary(draft('repayment',{account_id:'euro',target_id:'loan',amount:100,fx_rate:1.25}),ctx),/Repayment · <b>Car loan<\/b>\n\$100 · 30 September 2026\nfrom Euro cash · ≈ €80\n1 USD = 0.8 EUR/);
 assert.match(summary(draft('mortgage',{account_id:'card',target_id:'flat',amount:1000,interest:200,fx_rate:0.8}),ctx),/Mortgage payment · <b>Flat<\/b>\nprincipal €1,000 · interest €200 · 30 September 2026\nfrom Card · ≈ \$1,500/);
 assert.match(summary(draft('mortgage',{target_id:'flat',account_id:'euro'}),ctx),/principal €0 · interest €0 · 30 September 2026\nfrom Euro cash$/);
 assert.match(summary(draft('repayment',{target_id:'loan',account_id:'card'}),ctx),/\$0 · 30 September 2026\nfrom Card$/);
 assert.match(summary(draft('liability',{lkind:'Mortgage',name:'Home',amount:1000,currency:'USD',date:'2040-01-01',rate:4.5,payment:20}),ctx),/Mortgage · <b>Home<\/b>\n\$1,000 · Due: 1 January 2040\nInterest rate 4\.5% · Monthly payment \$20/);
 assert.match(summary(draft('liability',{currency:'USD'}),ctx),/Loan · <b><\/b>\n\$0 · Due: 30 September 2026\nInterest rate 0% · Monthly payment \$0/);
 assert.equal(summary(draft('account',{account_name:'Wallet'}),ctx),'<b>Save this?</b>');
});

test('a finished conversation saves a record the record schema accepts, or a payment for the planning functions',()=>{
 const account=commitFor({kind:'account',step:'balance',data:{account_name:'Wallet',currency:'USD',amount:40}},ctx);
 assert.equal(account.type,'record');assert.equal(account.record.id,'77000000-0000-4000-8000-000000000099');assert.equal(account.record.quantity,1);
 assert.ok(recordSchema.safeParse(account.record).success);
 const blankAccount=commitFor({kind:'account',step:'balance',data:{id:'kept'}},ctx);
 assert.deepEqual([blankAccount.record.id,blankAccount.record.name,blankAccount.record.amount],['kept','',0]);
 const loan=commitFor({kind:'liability',step:'confirm',data:{name:'Car',lkind:'Loan',currency:'USD',amount:900,rate:7,payment:50,date:'2030-01-01'}},ctx);
 assert.deepEqual([loan.record.kind,loan.record.opened_on,loan.record.estimated_monthly_payment,loan.record.rate],['Loan','2026-09-30',50,7]);
 assert.ok(recordSchema.safeParse(loan.record).success);
 const blankLoan=commitFor({kind:'liability',step:'confirm',data:{}},ctx);
 assert.deepEqual([blankLoan.record.kind,blankLoan.record.date,blankLoan.record.rate],['Loan','2026-09-30',0]);
 const custom=commitFor(draft('income',{custom_category_id:'side',category_name:'Side gig',amount:30,account_id:'card',date:'2026-09-28'}),ctx);
 assert.deepEqual([custom.record.kind,custom.record.name,custom.record.custom_category_id,custom.record.business_id],['Other income','Side gig','side',undefined]);
 const shop=commitFor(draft('expense',{category:'Living expense',name:' Flour ',amount:9,account_id:'shop'}),ctx);
 assert.deepEqual([shop.record.business_id,shop.record.name,shop.record.date],['biz','Flour','2026-09-30'],'the account’s business, the name trimmed, dated today');
 const converted=commitFor(draft('expense',{category:'Living expense',amount:9,currency:'EUR',fx_rate:0.9,account_id:'card',date:'2026-09-20'}),ctx);
 assert.deepEqual([converted.record.account_exchange_rate,converted.fx],[0.9,{account_rate_date:'2026-09-20',account_currency:'USD'}]);
 assert.deepEqual(commitFor(draft('expense',{category:'Living expense',amount:9,currency:'EUR',fx_rate:0.9,fx_rate_date:'2026-09-19',account_id:'card'}),ctx).fx.account_rate_date,'2026-09-19');
 const transfer=commitFor(draft('transfer',{account_id:'card',target_id:'shop',amount:20}),ctx);
 assert.deepEqual(transfer,{type:'planning',action:'transfer',data:{id:'77000000-0000-4000-8000-000000000099',account_id:'card',target_id:'shop',date:'2026-09-30',notes:'',amount:20,received:20,fee:0}});
 assert.equal(commitFor(draft('transfer',{account_id:'card',target_id:'euro'}),ctx).data.amount,0);
 const repayment=commitFor(draft('repayment',{account_id:'card',target_id:'loan',amount:100}),ctx);
 assert.deepEqual([repayment.type,repayment.action,repayment.data.fee],['planning','repayment',0]);
 const mortgage=commitFor(draft('mortgage',{account_id:'euro',target_id:'flat',amount:500,interest:50}),ctx);
 assert.deepEqual([mortgage.type,mortgage.data.fee],['planning',50]);
 assert.equal(commitFor(draft('mortgage',{account_id:'euro',target_id:'flat'}),ctx).data.fee,0);
 const fx=commitFor(draft('mortgage',{account_id:'card',target_id:'flat',amount:500,interest:50,fx_rate:0.9,date:'2026-09-01'}),ctx);
 assert.deepEqual([fx.type,fx.rate,fx.rate_date,fx.account_currency,fx.record_currency],['fxpayment',0.9,'2026-09-01','USD','EUR']);
 assert.equal(commitFor(draft('repayment',{account_id:'euro',target_id:'loan',amount:5,fx_rate:1.1,fx_rate_date:'2026-08-01'}),ctx).rate_date,'2026-08-01');
});
