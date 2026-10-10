import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';

// Saving what the button flow produced: which wrapper each commit goes to, and the words for a refused save.
const {commitDraft}=loadTS('lib/telegram-bot/save.ts');
const {formatMoney}=loadTS('lib/format.ts');
const id=n=>`77000000-0000-4000-8000-0000000000${String(n).padStart(2,'0')}`;
const card={id:id(1),name:'Card',kind:'Cash',currency:'USD',amount:50,quantity:0,cost:0,rate:0,date:'2026-01-01',frequency:'Once',notes:''};
const ctx={language:'en',today:'2026-09-30',newId:id(99),categories:[{id:id(5),name:'Groceries',direction:'expense'}],accounts:[card],liabilities:[],records:[card]};
const record=(over={})=>({id:id(9),name:'Shop',kind:'Living expense',currency:'USD',amount:80,quantity:0,cost:0,rate:0,date:'2026-09-30',frequency:'Once',notes:'',account_id:card.id,payment_type:'regular',estimated_monthly_payment:0,estimated_monthly_income:0,ownership_percentage:100,...over});
const payment=(over={})=>({id:id(8),account_id:card.id,target_id:id(7),amount:20,received:0,fee:0,date:'2026-09-30',notes:'',...over});
/** A database that answers every write with `reply`, and keeps what was written. */
const database=(reply={ok:true,body:{}})=>{const writes=[];return {writes,read:async()=>[],write:async(path,init)=>{writes.push([path,JSON.parse(init.body)]);return {ok:reply.ok,json:async()=>reply.body};}};};

test('each commit goes to its owner-scoped wrapper, and a save is confirmed with what was saved',async()=>{
 const db=database();
 const saved=await commitDraft(db,'owner',{type:'record',record:record(),fx:{account_rate_date:'2026-09-29',account_currency:'EUR'}},ctx);
 assert.equal(saved.saved,true);assert.match(saved.text,/^Saved\.\n/);
 assert.deepEqual([db.writes[0][0],db.writes[0][1].p_record.account_currency],['/rest/v1/rpc/telegram_save_finance_record','EUR']);
 await commitDraft(db,'owner',{type:'planning',action:'transfer',data:payment({received:20})},ctx);
 assert.equal(db.writes[1][0],'/rest/v1/rpc/telegram_planning_action');
 await commitDraft(db,'owner',{type:'fxpayment',action:'repayment',data:payment(),rate:1.1,rate_date:'2026-09-30',account_currency:'USD',record_currency:'EUR'},ctx);
 assert.deepEqual([db.writes[2][0],db.writes[2][1].p_rate,db.writes[2][1].p_record_currency],['/rest/v1/rpc/telegram_payment_with_fx',1.1,'EUR']);
 const mortgage=await commitDraft(db,'owner',{type:'planning',action:'mortgage',data:payment({fee:5})},ctx);
 assert.equal(mortgage.saved,true);
 const repayment=await commitDraft(db,'owner',{type:'planning',action:'repayment',data:payment()},ctx);
 assert.equal(repayment.saved,true);
});

test('fields the schemas refuse, or a conversion without a rate, are not sent',async()=>{
 const db=database();
 const refused='Could not save. Check the record fields.';
 assert.deepEqual(await commitDraft(db,'owner',{type:'record',record:record({id:'not-a-uuid'})},ctx),{text:refused,saved:false});
 assert.deepEqual(await commitDraft(db,'owner',{type:'planning',action:'transfer',data:payment({amount:-1})},ctx),{text:refused,saved:false});
 assert.deepEqual(await commitDraft(db,'owner',{type:'fxpayment',action:'mortgage',data:payment(),rate:0,rate_date:'2026-09-30',account_currency:'USD',record_currency:'EUR'},ctx),{text:refused,saved:false});
 assert.deepEqual(await commitDraft(db,'owner',{type:'fxpayment',action:'mortgage',data:payment({amount:-3}),rate:1,rate_date:'2026-09-30',account_currency:'USD',record_currency:'EUR'},ctx),{text:refused,saved:false});
 assert.equal(db.writes.length,0);
});

test('a refused save says why in the app’s words: the account that is short, a named refusal, a duplicate',async()=>{
 const refuse=async(body,commit={type:'record',record:record()})=>(await commitDraft(database({ok:false,body}),'owner',commit,ctx)).text;
 assert.equal(await refuse({code:'23514'}),`Could not save. Insufficient balance: Card has ${formatMoney(50,'USD','en-US')}.`);
 assert.equal(await refuse({code:'P0001',message:'Insufficient balance in Card'}),`Could not save. Insufficient balance: Card has ${formatMoney(50,'USD','en-US')}.`);
 // A conversion is weighed in the account's currency: 80 EUR at 2 per dollar takes 40 of the 50.
 assert.equal(await refuse({code:'23514'},{type:'record',record:record({currency:'EUR',account_exchange_rate:2})}),'Could not save. Insufficient balance or invalid amount.');
 assert.equal(await refuse({code:'23514'},{type:'record',record:record({kind:'Salary'})}),'Could not save. Insufficient balance or invalid amount.','income takes nothing out');
 assert.equal(await refuse({code:'23514'},{type:'planning',action:'mortgage',data:payment({amount:40,fee:20})}),`Could not save. Insufficient balance: Card has ${formatMoney(50,'USD','en-US')}.`);
 assert.equal(await refuse({code:'23514'},{type:'fxpayment',action:'repayment',data:payment({amount:60}),rate:2,rate_date:'2026-09-30',account_currency:'USD',record_currency:'EUR'}),'Could not save. Insufficient balance or invalid amount.');
 assert.equal(await refuse({code:'P0001',message:'Choose a cash account.'}),'Could not save. Choose a cash account.');
 assert.equal(await refuse({code:'23505'}),'Could not save. This name or payment already exists.');
 assert.equal(await refuse({}),'Could not save. Please try again.');
 const unreadable=await commitDraft({read:async()=>[],write:async()=>({ok:false,json:async()=>{throw Error('no body');}})},'owner',{type:'record',record:record()},ctx);
 assert.equal(unreadable.text,'Could not save. Please try again.');
});

test('a duplicate of the commit’s own id whose row is in the database counts as saved: the redelivered Save confirms',async()=>{
 /** A database that refuses the write as a duplicate key and holds `rows` under the path they are looked up by. */
 const duplicate=(failure,rows)=>{const reads=[];return {reads,read:async path=>{reads.push(path);return rows[path]??[];},write:async()=>({ok:false,json:async()=>failure})};};
 const pkey=(table,id)=>({code:'23505',message:`duplicate key value violates unique constraint "${table}_pkey"`,details:`Key (id)=(${id}) already exists.`});
 const recordDb=duplicate(pkey('finance_records',id(9)),{[`/rest/v1/finance_records?select=id&id=eq.${id(9)}&user_id=eq.owner`]:[{id:id(9)}]});
 const saved=await commitDraft(recordDb,'owner',{type:'record',record:record()},ctx);
 assert.equal(saved.saved,true);assert.match(saved.text,/^Saved\.\n/);
 assert.deepEqual(recordDb.reads,[`/rest/v1/finance_records?select=id&id=eq.${id(9)}&user_id=eq.owner`],'looked up by its own id and owner only');
 // A payment lives in account_activity under the id the draft chose.
 const paymentDb=duplicate(pkey('account_activity',id(8)),{[`/rest/v1/account_activity?select=id&id=eq.${id(8)}&user_id=eq.owner`]:[{id:id(8)}]});
 assert.equal((await commitDraft(paymentDb,'owner',{type:'planning',action:'repayment',data:payment()},ctx)).saved,true);
 assert.equal((await commitDraft(paymentDb,'owner',{type:'fxpayment',action:'repayment',data:payment(),rate:1.1,rate_date:'2026-09-30',account_currency:'USD',record_currency:'EUR'},ctx)).saved,true);
 // The primary key named without the row being there (another owner's, say) is still a refusal.
 const missing=duplicate(pkey('finance_records',id(9)),{});
 assert.deepEqual(await commitDraft(missing,'owner',{type:'record',record:record()},ctx),{text:'Could not save. This name or payment already exists.',saved:false});
 // A duplicate of a name or a payment date is not about the id: no lookup, the refusal stands.
 const clash=duplicate({code:'23505',message:'duplicate key value violates unique constraint "custom_categories_user_id_name_key"'},{[`/rest/v1/finance_records?select=id&id=eq.${id(9)}&user_id=eq.owner`]:[{id:id(9)}]});
 assert.equal((await commitDraft(clash,'owner',{type:'record',record:record()},ctx)).saved,false);
 assert.equal(clash.reads.length,0);
});
