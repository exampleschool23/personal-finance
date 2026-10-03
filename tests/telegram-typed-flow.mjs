import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {advance,needsRate,withRate,prompt,mainMenu}=loadTS('lib/telegram-flow.ts');
const {recordSchema}=loadTS('lib/record-schema.ts');
const {planningSchemas}=loadTS('lib/planning-schemas.ts');
const {translate}=loadTS('lib/i18n.ts');
const id=n=>`78000000-0000-4000-8000-0000000000${String(n).padStart(2,'0')}`;
const entry=(n,name,kind,amount,currency='UZS',over={})=>({id:id(n),name,kind,amount,currency,quantity:0,cost:0,rate:0,date:'2026-01-01',frequency:'Once',notes:'',...over});
const ctx=(over={})=>({language:'en',today:'2026-09-30',newId:id(99),currencies:['UZS','USD'],
 categories:[{id:id(20),name:'Groceries',direction:'expense'}],
 accounts:[entry(1,'Wallet','Cash',900000),entry(2,'Card','Cash',300,'USD')],
 liabilities:[entry(10,'Car loan','Loan',2000,'USD'),entry(11,'Flat','Mortgage',5000,'USD')],
 records:[],rules:[],...over});
const chat=7;
const buttons=reply=>reply.keyboard.inline.flat().map(button=>button.callback_data);
function run(steps,context=ctx()){
 let draft=null,result=null;const commits=[];
 for(const input of steps){result=advance(draft,input,context,chat);draft=result.draft;if(result.commit)commits.push(result.commit);}
 return {...result,commits};
}

test('a typed expense becomes a confirmation card and is saved only by Save',()=>{
 const card=run([{text:'coffee 4500'}]);
 assert.equal(card.draft.kind,'expense');assert.equal(card.draft.step,'confirm');assert.equal(card.commit,undefined);
 assert.equal(card.reply.text,'<b>Save this?</b>\nExpense · Living expense\n<b>Coffee</b> · UZS 4,500 · 30 September 2026\nfrom Wallet');
 assert.deepEqual(buttons(card.reply),['f:save','f:chcat','f:chacc','f:cancel']);
 // Anything but Save leaves it unsaved; Cancel drops it.
 for(const input of [{text:'yes'},{callback:'f:back'},{callback:'f:skip'}])assert.equal(advance(card.draft,input,ctx(),chat).commit,undefined);
 const cancelled=advance(card.draft,{callback:'f:cancel'},ctx(),chat);assert.equal(cancelled.draft,null);assert.equal(cancelled.commit,undefined);
 const saved=advance(card.draft,{callback:'f:save'},ctx(),chat);
 assert.equal(saved.draft,null);assert.ok(recordSchema.safeParse(saved.commit.record).success);
 assert.deepEqual({...saved.commit.record},{id:id(99),name:'Coffee',kind:'Living expense',custom_category_id:null,currency:'UZS',amount:4500,quantity:0,cost:0,rate:0,date:'2026-09-30',frequency:'Once',notes:'',account_id:id(1),payment_type:'regular',estimated_monthly_payment:0,estimated_monthly_income:0,ownership_percentage:100});
 assert.equal(saved.commit.fx,undefined);
});

test('typed income, a named account, a custom category, a date and Russian and Uzbek text all land on the card',()=>{
 const salary=run([{text:'+1500 salary usd'}]);
 assert.equal(salary.draft.kind,'income');assert.equal(salary.draft.data.category,'Salary');assert.equal(salary.draft.data.account_id,id(2),'the typed currency picks the account');
 assert.match(salary.reply.text,/^<b>Save this\?<\/b>\nIncome · Salary\n<b>Salary<\/b> · \+?\$1,500 · 30 September 2026\ninto Card$/);
 const groceries=run([{text:'groceries 30 card yesterday'}]);
 assert.deepEqual([groceries.draft.data.custom_category_id,groceries.draft.data.account_id,groceries.draft.data.date,groceries.draft.data.amount],[id(20),id(2),'2026-09-29',30]);
 const ru=run([{text:'такси 25 000 сум вчера'}],ctx({language:'ru'}));
 assert.equal(ru.draft.data.category,'Living expense');assert.equal(ru.draft.data.amount,25000);assert.equal(ru.draft.data.date,'2026-09-29');
 assert.match(ru.reply.text,new RegExp(translate('ru','Save this?')));
 const uz=run([{text:'oylik +3 000 000'}],ctx({language:'uz'}));
 assert.equal(uz.draft.kind,'income');assert.equal(uz.draft.data.category,'Salary');assert.equal(uz.draft.data.amount,3000000);
});

test('the guess uses the owner\'s rules and history, never another owner\'s',()=>{
 const rules=[{id:'r',pattern:'netflix',match:'contains',direction:'expense',account_id:null,match_business_id:null,match_kind:null,match_category_id:null,amount_min:null,amount_max:null,kind:'Other expense',category_id:id(20),business_id:null,tag_ids:[],created_at:'2026-01-01'}];
 assert.equal(run([{text:'Netflix 10 usd'}],ctx({rules})).draft.data.custom_category_id,id(20));
 const records=[entry(30,'Gym','Charity',50,'USD',{account_id:id(2),date:'2026-09-01'})];
 const gym=run([{text:'gym 50'}],ctx({records}));
 assert.equal(gym.draft.data.category,'Charity');assert.equal(gym.draft.data.account_id,id(2),'last used account for that name');
 // The flow only sees the records it is handed, which the bot reads for the owner alone.
 assert.equal(run([{text:'gym 50'}]).draft.data.category,'Other expense');
});

test('change category, account and business from the card; each returns to the card',()=>{
 const withBusiness=ctx({businesses:[entry(40,'Cafe','Business',0,'USD')]});
 const card=run([{text:'coffee 4500'}],withBusiness);
 assert.deepEqual(buttons(card.reply),['f:save','f:chcat','f:chacc','f:chbiz','f:cancel']);
 const category=advance(card.draft,{callback:'f:chcat'},withBusiness,chat);
 assert.equal(category.draft.step,'category');assert.ok(buttons(category.reply).includes('f:flip'));assert.ok(buttons(category.reply).includes('f:back'));
 assert.equal(advance(category.draft,{callback:'f:back'},withBusiness,chat).draft.step,'confirm','Back keeps the card as it was');
 const charity=advance(category.draft,{callback:'f:cat:Charity'},withBusiness,chat);
 assert.equal(charity.draft.step,'confirm');assert.equal(charity.draft.data.category,'Charity');assert.equal(charity.draft.data.amount,4500);
 const flipped=advance(category.draft,{callback:'f:flip'},withBusiness,chat);
 assert.equal(flipped.draft.kind,'income');assert.equal(flipped.draft.step,'category');assert.equal(flipped.draft.data.category,undefined);
 // Business income asks for its business before returning to the card.
 const owed=advance(flipped.draft,{callback:'f:cat:Business income'},withBusiness,chat);
 assert.equal(owed.draft.step,'business');assert.ok(!buttons(owed.reply).includes('f:biz:none'));
 const back=advance(advance(owed.draft,{callback:'f:biz:'+id(40)},withBusiness,chat).draft,{callback:'f:save'},withBusiness,chat);
 assert.equal(back.commit.record.kind,'Business income');assert.equal(back.commit.record.business_id,id(40));assert.ok(recordSchema.safeParse(back.commit.record).success);
 const account=advance(card.draft,{callback:'f:chacc'},withBusiness,chat);
 assert.equal(account.draft.step,'account');
 assert.equal(advance(account.draft,{callback:'f:acc:'+id(2)},withBusiness,chat).draft.data.account_id,id(2));
 const business=advance(card.draft,{callback:'f:chbiz'},withBusiness,chat);
 assert.deepEqual(buttons(business.reply),['f:biz:'+id(40),'f:biz:none','f:back','f:cancel']);
 const assigned=advance(advance(business.draft,{callback:'f:biz:'+id(40)},withBusiness,chat).draft,{callback:'f:save'},withBusiness,chat);
 assert.equal(assigned.commit.record.business_id,id(40));assert.equal(assigned.commit.record.kind,'Living expense');
 assert.match(advance(business.draft,{callback:'f:biz:'+id(40)},withBusiness,chat).reply.text,/\nBusiness: Cafe$/);
 assert.equal(advance(card.draft,{callback:'f:chbiz'},ctx(),chat).draft.step,'confirm','no businesses, no business question');
});

test('a currency the owner does not keep is asked about; unreadable text gets the menu with an example',()=>{
 const asked=run([{text:'lunch 12 eur'}]);
 assert.equal(asked.draft.step,'currency');assert.equal(asked.reply.text,'Which currency was it?');assert.deepEqual(buttons(asked.reply),['f:cur:UZS','f:cur:USD','f:cancel']);
 const chosen=advance(asked.draft,{callback:'f:cur:USD'},ctx(),chat);
 assert.equal(chosen.draft.step,'confirm');assert.equal(chosen.draft.data.currency,'USD');
 const stray=run([{text:'hello there'}]);
 assert.equal(stray.draft,null);assert.equal(stray.reply.text,'Choose what to add, or type it, like coffee 4.5 or +1,500 salary.');assert.deepEqual(stray.reply.keyboard,mainMenu('en'));
 assert.equal(run([{text:'coffee 3 2026-12-01'}]).reply.text,'Type a past or present date like 30 September 2026');
 // Typing an entry at a button question starts it afresh; at a typed question the text is an answer.
 assert.equal(run([{text:'Transfer'},{text:'coffee 4500'}]).draft.step,'confirm');
 assert.equal(run([{text:'Expense'},{callback:'f:cat:Charity'},{callback:'f:acc:'+id(1)},{text:'coffee 4500'}]).draft.step,'amount');
 // No cash account yet: the card waits for one, created in the chat.
 const empty=run([{text:'coffee 4500'}],ctx({accounts:[]}));
 assert.equal(empty.draft.step,'account');assert.ok(buttons(empty.reply).includes('f:newacc'));assert.ok(!buttons(empty.reply).includes('f:back'));
});

test('an entry in another currency waits for the dated rate and saves it with the rate day and account currency',()=>{
 const card=run([{text:'lunch 12 usd wallet'}]);
 assert.deepEqual(needsRate(card.draft,ctx()),{from:'UZS',to:'USD',date:'2026-09-30'});
 assert.equal(advance(card.draft,{callback:'f:save'},ctx(),chat).commit,undefined,'never saved without a rate');
 // 1 UZS = 0.00008 USD, so 12 USD takes 150,000 UZS from the wallet.
 const rated=withRate(card.draft,{rate:0.00008,effective_date:'2026-09-29'});
 assert.equal(needsRate(rated,ctx()),null);
 assert.match(prompt(rated,ctx(),chat).text,/<b>Lunch<\/b> · \$12 · 30 September 2026\nfrom Wallet · ≈ UZS 150,000\n1 USD = 12,500 UZS$/);
 const saved=advance(rated,{callback:'f:save'},ctx(),chat);
 assert.equal(saved.commit.record.currency,'USD');assert.equal(saved.commit.record.amount,12);assert.equal(saved.commit.record.account_exchange_rate,0.00008);
 assert.deepEqual(saved.commit.fx,{account_rate_date:'2026-09-29',account_currency:'UZS'});
 assert.ok(recordSchema.safeParse(saved.commit.record).success);
 // Another account forgets the rate.
 const moved=advance(advance(rated,{callback:'f:chacc'},ctx(),chat).draft,{callback:'f:acc:'+id(2)},ctx(),chat);
 assert.equal(moved.draft.data.fx_rate,undefined);assert.equal(needsRate(moved.draft,ctx()),null,'same currency now');
 for(const bad of [null,{rate:0,effective_date:'2026-09-29'},{rate:NaN,effective_date:'2026-09-29'}])assert.equal(withRate(card.draft,bad).step,'fxamount');
});

test('without a rate the owner types the converted amount or the rate; nothing is inferred',()=>{
 const card=run([{text:'lunch 12 usd wallet'}]);
 const ask=withRate(card.draft,null);
 const text=prompt(ask,ctx(),chat);
 assert.equal(text.text,'There is no USD to UZS exchange rate for 30 September 2026. How much is this in UZS, the currency of Wallet?');
 assert.deepEqual(buttons(text),['f:fxrate','f:cancel']);
 assert.match(advance(ask,{text:'abc'},ctx(),chat).reply.text,/positive number/);
 assert.equal(advance(ask,{text:'0'},ctx(),chat).draft.step,'fxamount');
 const amount=advance(ask,{text:'151 200'},ctx(),chat);
 assert.equal(amount.draft.step,'confirm');assert.equal(amount.draft.data.fx_rate,12/151200);assert.equal(amount.draft.data.fx_rate_date,'2026-09-30');
 assert.match(amount.reply.text,/≈ UZS 151,200\n1 USD = 12,600 UZS/);
 const rate=advance(advance(ask,{callback:'f:fxrate'},ctx(),chat).draft,{text:'12 600'},ctx(),chat);
 assert.equal(rate.draft.data.fx_rate,1/12600);
 const saved=advance(rate.draft,{callback:'f:save'},ctx(),chat);
 assert.equal(saved.commit.record.account_exchange_rate,1/12600);assert.equal(Math.round(saved.commit.record.amount/saved.commit.record.account_exchange_rate),151200);
 // In the button flow Back from the question returns to the date and forgets the rate.
 const flow=run([{text:'Expense'},{callback:'f:cat:Charity'},{callback:'f:acc:'+id(1)},{callback:'f:amtcur:USD'},{text:'12'},{callback:'f:skip'},{callback:'f:date:today'}]);
 const asked=withRate(flow.draft,null);
 const back=advance(asked,{callback:'f:back'},ctx(),chat);
 assert.equal(back.draft.step,'date');assert.equal(back.draft.data.fx_rate,undefined);
});

test('the button flow takes an amount in another of the owner\'s currencies',()=>{
 const amount=run([{text:'Expense'},{callback:'f:cat:Charity'},{callback:'f:acc:'+id(1)}]);
 assert.equal(amount.reply.text,'Type the amount in UZS');assert.deepEqual(buttons(amount.reply),['f:amtcur:USD','f:back','f:cancel']);
 const switched=advance(amount.draft,{callback:'f:amtcur:USD'},ctx(),chat);
 assert.equal(switched.reply.text,'Type the amount in USD');assert.deepEqual(buttons(switched.reply),['f:amtcur:UZS','f:back','f:cancel']);
 assert.equal(advance(amount.draft,{callback:'f:amtcur:EUR'},ctx(),chat).draft.data.currency,undefined,'only the owner\'s currencies');
 const typed=advance(amount.draft,{text:'12 usd'},ctx(),chat);
 assert.equal(typed.draft.data.amount,12);assert.equal(typed.draft.data.currency,'USD');
 assert.equal(advance(amount.draft,{text:'$12.50'},ctx(),chat).draft.data.amount,12.5);
 const refused=advance(amount.draft,{text:'12 eur'},ctx(),chat);
 assert.equal(refused.draft.step,'amount');assert.equal(refused.reply.text,'EUR is not one of your currencies. Type the amount in UZS, or add EUR in Settings.');
 assert.equal(advance(amount.draft,{text:'250 000'},ctx(),chat).draft.data.currency,undefined,'a plain number stays in the account currency');
});

test('a loan or mortgage can be paid from an account in another currency at the dated rate',()=>{
 const repay=run([{text:'Pay loan or debt'},{callback:'f:tgt:'+id(10)},{callback:'f:acc:'+id(1)},{text:'400'},{callback:'f:date:today'}]);
 assert.deepEqual(needsRate(repay.draft,ctx()),{from:'UZS',to:'USD',date:'2026-09-30'});
 const rated=withRate(repay.draft,{rate:0.00008,effective_date:'2026-09-30'});
 assert.match(prompt(rated,ctx(),chat).text,/\$400 · 30 September 2026\nfrom Wallet · ≈ UZS 5,000,000\n1 USD = 12,500 UZS/);
 const saved=advance(rated,{callback:'f:save'},ctx(),chat).commit;
 assert.deepEqual(saved,{type:'fxpayment',action:'repayment',data:{id:id(99),account_id:id(1),target_id:id(10),date:'2026-09-30',notes:'',amount:400,received:0,fee:0},rate:0.00008,rate_date:'2026-09-30',account_currency:'UZS',record_currency:'USD'});
 assert.ok(planningSchemas.repayment.safeParse(saved.data).success);
 // A mortgage: principal and interest together are converted when typed by hand.
 const mortgage=run([{text:'Mortgage payment'},{callback:'f:tgt:'+id(11)},{callback:'f:acc:'+id(1)},{text:'300'},{text:'100'},{callback:'f:date:today'}]);
 const typed=advance(withRate(mortgage.draft,null),{text:'5 000 000'},ctx(),chat);
 assert.equal(typed.draft.data.fx_rate,400/5000000);
 const paid=advance(typed.draft,{callback:'f:save'},ctx(),chat).commit;
 assert.equal(paid.type,'fxpayment');assert.equal(paid.action,'mortgage');assert.deepEqual([paid.data.amount,paid.data.fee],[300,100]);
 // Same currency stays the plain planning action.
 assert.equal(run([{text:'Pay loan or debt'},{callback:'f:tgt:'+id(10)},{callback:'f:acc:'+id(2)},{text:'100'},{callback:'f:date:today'},{callback:'f:save'}]).commit.type,'planning');
});
