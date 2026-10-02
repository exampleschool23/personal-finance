import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {handleTelegramUpdate}=loadTS('lib/telegram-bot.ts');
const now=new Date('2026-09-30T09:00:00Z');
const clock={now,today:'2026-09-30',newId:()=>'99999999-9999-4999-8999-999999999999'};
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const id=n=>`77000000-0000-4000-8000-0000000000${String(n).padStart(2,'0')}`;
const entry=(n,name,kind,amount,currency='UZS')=>({id:id(n),user_id:owner,name,kind,amount,currency,quantity:0,cost:0,rate:0,date:'2026-01-01',frequency:'Once',notes:''});
function fakeDb({subscriptions=[],languages={},records=[],categories=[],occurrences=[],activity=[],mortgagePayments=[],drafts=[],failWrites=false,rpcFailure=null}={}){
 const writes=[];
 return {writes,drafts,
  async read(path){
   const owner=/user_id=eq\.([\w-]+)/.exec(path)?.[1];
   if(path.startsWith('/rest/v1/telegram_subscriptions')){
    const chat=/chat_id=eq\.(\d+)/.exec(path),code=/link_code=eq\.(\w+)/.exec(path);
    return subscriptions.filter(s=>chat?s.chat_id===Number(chat[1]):code?s.link_code===code[1]:true);
   }
   if(path.startsWith('/rest/v1/user_preferences'))return owner in languages?[{language:languages[owner]}]:[];
   if(path.startsWith('/rest/v1/finance_records'))return records.filter(r=>r.user_id===owner);
   if(path.startsWith('/rest/v1/transaction_categories'))return categories;
   if(path.startsWith('/rest/v1/payment_occurrences'))return occurrences;
   if(path.startsWith('/rest/v1/account_activity'))return activity;
   if(path.startsWith('/rest/v1/mortgage_payments'))return mortgagePayments;
   if(path.startsWith('/rest/v1/telegram_drafts'))return drafts.filter(d=>d.user_id===owner);
   throw Error('unexpected read '+path);
  },
  async write(path,init={}){
   const body=init.body?JSON.parse(init.body):null;writes.push({path,method:init.method,body});
   if(path.startsWith('/rest/v1/telegram_drafts')){
    if(init.method==='DELETE')drafts.splice(0,drafts.length,...drafts.filter(d=>!path.includes(d.user_id)));
    else{drafts.splice(0,drafts.length,...drafts.filter(d=>d.user_id!==body.user_id));drafts.push(body);}
   }
   if(path.startsWith('/rest/v1/rpc/')&&rpcFailure)return Response.json(rpcFailure,{status:400});
   return new Response(path.startsWith('/rest/v1/rpc/')?'[{}]':null,{status:failWrites?500:path.startsWith('/rest/v1/rpc/')?200:204});
  },
 };
}
const pending={user_id:owner,chat_id:null,digest_enabled:true,actions_enabled:true,link_code:'ABCDEFGH',link_code_expires_at:'2026-09-30T09:10:00.000Z',linked_at:null};
const linked={user_id:owner,chat_id:500,digest_enabled:true,actions_enabled:true,link_code:null,link_code_expires_at:null,linked_at:'2026-09-29T00:00:00Z'};
const message=(chat,text,language_code)=>({message:{chat:{id:chat},text,from:{language_code}}});
const press=(chat,data)=>({callback_query:{id:'cb-'+data,data,message:{chat:{id:chat}}}});
const workspace=()=>({subscriptions:[linked],languages:{[owner]:'en'},records:[entry(1,'Wallet','Cash',900000),entry(2,'Card','Cash',300,'USD'),entry(10,'Car loan','Loan',2000,'USD')],categories:[{id:id(20),name:'Groceries',direction:'expense'}]});

test('a valid start code links the chat, clears the code, answers in the owner language and shows the menu',async()=>{
 const db=fakeDb({subscriptions:[pending],languages:{[owner]:'ru'}});
 const outcome=await handleTelegramUpdate(message(500,'/start ABCDEFGH','en'),db,clock);
 assert.equal(outcome.replies.length,1);assert.equal(outcome.replies[0].chat_id,500);
 assert.match(outcome.replies[0].text,/^Подключено\./);
 assert.deepEqual(outcome.replies[0].keyboard.reply[0],['Расход','Доходы']);
 assert.equal(db.writes.length,1);
 assert.equal(db.writes[0].path,'/rest/v1/telegram_subscriptions?on_conflict=user_id');
 assert.deepEqual(db.writes[0].body,{user_id:owner,chat_id:500,link_code:null,link_code_expires_at:null,linked_at:now.toISOString(),updated_at:now.toISOString()});
});

test('expired, unknown or malformed codes never write and reply in the Telegram client language',async()=>{
 const db=fakeDb({subscriptions:[{...pending,link_code_expires_at:'2026-09-30T08:59:59.000Z'}]});
 assert.match((await handleTelegramUpdate(message(500,'/start ABCDEFGH','uz'),db,clock)).replies[0].text,/^Havola muddati tugagan/);
 assert.match((await handleTelegramUpdate(message(500,'/start ZZZZZZZZ','ru'),db,clock)).replies[0].text,/^Срок действия ссылки истёк/);
 assert.match((await handleTelegramUpdate(message(500,'/start 0000','fi'),db,clock)).replies[0].text,/^Welcome to Hoggish/);
 assert.equal(db.writes.length,0);
});

test('a chat that already served another owner is released before it is linked',async()=>{
 const db=fakeDb({subscriptions:[pending,{...linked,user_id:other}],languages:{[owner]:'en'}});
 await handleTelegramUpdate(message(500,'/start ABCDEFGH'),db,clock);
 assert.equal(db.writes[0].path,'/rest/v1/telegram_subscriptions?user_id=eq.'+other);
 assert.deepEqual(db.writes[0].body,{chat_id:null,linked_at:null,updated_at:now.toISOString(),telegram_user_id:null,first_name:null});
 assert.equal(db.writes[1].body.chat_id,500);
});

test('stop unlinks a connected chat, drops its draft and removes the keyboard; a bare start shows the menu again',async()=>{
 const db=fakeDb({subscriptions:[linked],languages:{[owner]:'ru'},drafts:[{user_id:owner,step:'expense:amount',data:{},updated_at:now.toISOString()}]});
 const stopped=await handleTelegramUpdate(message(500,'/stop'),db,clock);
 assert.match(stopped.replies[0].text,/^Вы вышли\./);assert.deepEqual(stopped.replies[0].keyboard,{remove:true});
 assert.deepEqual(db.writes[0].body,{chat_id:null,linked_at:null,updated_at:now.toISOString(),telegram_user_id:null,first_name:null});
 assert.equal(db.writes[1].method,'DELETE');assert.equal(db.drafts.length,0);
 const again=await handleTelegramUpdate(message(500,'/start'),db,clock);
 assert.match(again.replies[0].text,/^Подключено\./);assert.ok(again.replies[0].keyboard.reply);
});

test('an unlinked chat is only invited to create an account or sign in, whether it types or presses, and nothing is written',async()=>{
 const db=fakeDb({subscriptions:[linked]});
 const [greeting,invited]=(await handleTelegramUpdate(message(999,'/stop','ru'),db,clock)).replies;
 assert.match(greeting.text,/^Добро пожаловать в Hoggish/);assert.deepEqual(invited.keyboard.inline.flat().map(button=>button.callback_data).filter(Boolean),['o:agree','o:signin']);
 const pressed=await handleTelegramUpdate({callback_query:{id:'cb1',data:'f:save',message:{chat:{id:999}},from:{language_code:'en'}}},db,clock);
 assert.equal(pressed.callbackId,'cb1');assert.match(pressed.replies[0].text,/^Welcome to Hoggish/);
 assert.equal(db.writes.length,0);
 assert.deepEqual(await handleTelegramUpdate({update_id:1},db,clock),{replies:[]});
});

test('a linked chat walks the expense flow across updates, keeps the draft in the database and saves through the owner wrapper',async()=>{
 const db=fakeDb(workspace());
 const menu=await handleTelegramUpdate(message(500,'hi'),db,clock);
 assert.equal(menu.replies[0].text,'Choose what to add.');
 assert.equal((await handleTelegramUpdate(message(500,'Expense'),db,clock)).replies[0].text,'Choose an expense category');
 assert.deepEqual(db.drafts.map(d=>d.step),['expense:category']);
 const account=await handleTelegramUpdate(press(500,'f:cat:'+id(20)),db,clock);
 assert.equal(account.callbackId,'cb-f:cat:'+id(20));assert.equal(account.replies[0].text,'From which account?');
 await handleTelegramUpdate(press(500,'f:acc:'+id(1)),db,clock);
 await handleTelegramUpdate(message(500,'250000'),db,clock);
 await handleTelegramUpdate(press(500,'f:skip'),db,clock);
 const confirm=await handleTelegramUpdate(press(500,'f:date:today'),db,clock);
 assert.match(confirm.replies[0].text,/^<b>Save this\?<\/b>/);
 assert.equal(db.drafts[0].step,'expense:confirm');
 const before=db.writes.length;
 const saved=await handleTelegramUpdate(press(500,'f:save'),db,clock);
 const rpc=db.writes.slice(before).find(write=>write.path==='/rest/v1/rpc/telegram_save_finance_record');
 assert.ok(rpc,'saved through the owner wrapper');
 assert.equal(rpc.body.p_owner,owner);
 assert.equal(rpc.body.p_record.id,clock.newId());assert.equal(rpc.body.p_record.kind,'Other expense');assert.equal(rpc.body.p_record.custom_category_id,id(20));assert.equal(rpc.body.p_record.amount,250000);assert.equal(rpc.body.p_record.currency,'UZS');assert.equal(rpc.body.p_record.account_id,id(1));
 // A custom category names the saved record, as the preview did, not its stored Other expense kind.
 assert.equal(saved.replies[0].text,'Saved.\nAdded Groceries\n<b>Groceries</b> · UZS 250,000 · 30 September 2026');
 assert.ok(saved.replies[0].keyboard.reply);
 assert.equal(db.drafts.length,0);
});

test('stale drafts are ignored, database refusals are relayed, and the loan flow goes through the planning wrapper',async()=>{
 const stale=fakeDb({...workspace(),drafts:[{user_id:owner,step:'expense:amount',data:{account_id:id(1)},updated_at:'2026-09-30T08:00:00Z'}]});
 assert.equal((await handleTelegramUpdate(message(500,'250000'),stale,clock)).replies[0].text,'Choose what to add.');
 const refused=fakeDb({...workspace(),rpcFailure:{code:'P0001',message:'Insufficient balance.'}});
 await handleTelegramUpdate(message(500,'Pay loan or debt'),refused,clock);
 await handleTelegramUpdate(press(500,'f:tgt:'+id(10)),refused,clock);
 await handleTelegramUpdate(press(500,'f:acc:'+id(2)),refused,clock);
 await handleTelegramUpdate(message(500,'400'),refused,clock);
 await handleTelegramUpdate(press(500,'f:date:today'),refused,clock);
 const outcome=await handleTelegramUpdate(press(500,'f:save'),refused,clock);
 // The refusal names the account and what it holds, so the owner knows how much is available.
 assert.equal(outcome.replies[0].text,'Could not save. Insufficient balance: Card has $300.');
 // The refused draft is kept at the confirmation, with Back to correct it.
 assert.deepEqual(outcome.replies[0].keyboard.inline.flat().map(button=>button.callback_data),['f:back','f:cancel']);
 assert.deepEqual(refused.drafts.map(d=>d.step),['repayment:confirm']);
 assert.equal((await handleTelegramUpdate(press(500,'f:back'),refused,clock)).replies[0].text,'Which day? Choose, or type a date like 2026-09-30');
 // An overdrawn account fails a balance constraint, which the bot explains as the app does.
 const overdrawn=fakeDb({...workspace(),rpcFailure:{code:'23514',message:'new row violates check constraint'},drafts:[{user_id:owner,step:'repayment:confirm',data:{id:id(50),target_id:id(10),account_id:id(2),amount:400,date:'2026-09-30'},updated_at:clock.now.toISOString()}]});
 assert.equal((await handleTelegramUpdate(press(500,'f:save'),overdrawn,clock)).replies[0].text,'Could not save. Insufficient balance: Card has $300.');
 // When the account holds enough, the constraint failure is about the amount itself, so the general wording stays.
 const invalid=fakeDb({...workspace(),rpcFailure:{code:'23514',message:'new row violates check constraint'},drafts:[{user_id:owner,step:'repayment:confirm',data:{id:id(50),target_id:id(10),account_id:id(2),amount:100,date:'2026-09-30'},updated_at:clock.now.toISOString()}]});
 assert.equal((await handleTelegramUpdate(press(500,'f:save'),invalid,clock)).replies[0].text,'Could not save. Insufficient balance or invalid amount.');
 const rpc=refused.writes.find(write=>write.path==='/rest/v1/rpc/telegram_planning_action');
 assert.deepEqual(rpc.body,{p_owner:owner,p_action:'repayment',p_data:{id:clock.newId(),account_id:id(2),target_id:id(10),amount:400,received:0,fee:0,date:'2026-09-30',notes:''}});
});

test('Upcoming answers with the digest or a friendly empty line',async()=>{
 const db=fakeDb({...workspace(),records:[{...entry(5,'Rent','Rent expense',3000000),frequency:'Monthly',date:'2026-10-01'}]});
 const due=await handleTelegramUpdate(message(500,'Upcoming payments'),db,clock);
 assert.match(due.replies[0].text,/^<b>Upcoming payments<\/b> · 30 September 2026\n\n<b>1 October 2026<\/b>\n• Rent/);
 const empty=await handleTelegramUpdate(message(500,'Upcoming payments'),fakeDb({subscriptions:[linked]}),clock);
 assert.equal(empty.replies[0].text,'No payments due in the next 31 days.');
});

test('a loan with a monthly payment is due every month on its start day, until a repayment is recorded that month',async()=>{
 const loan={...entry(10,'QA Car loan','Loan',5000,'USD'),opened_on:'2026-09-15',date:'2027-03-31',estimated_monthly_payment:250,created_at:'2026-09-15T06:00:00Z'};
 const due=await handleTelegramUpdate(message(500,'Upcoming payments'),fakeDb({...workspace(),records:[loan]}),clock);
 assert.match(due.replies[0].text,/<b>15 October 2026<\/b>\n• QA Car loan · \$250 · repayment/);
 // A repayment in October settles October; November is beyond the 31 days.
 const paid=await handleTelegramUpdate(message(500,'Upcoming payments'),fakeDb({...workspace(),records:[loan],activity:[{action:'repayment',target_id:loan.id,occurred_on:'2026-10-02'}]}),clock);
 assert.equal(paid.replies[0].text,'No payments due in the next 31 days.');
 // A mortgage is settled by a mortgage payment; without a start date the creation day in Tashkent is used.
 const flat={...entry(11,'Flat','Mortgage',50000000),date:'2040-01-01',estimated_monthly_payment:900000,created_at:'2026-09-03T20:00:00Z'};
 const mortgage=await handleTelegramUpdate(message(500,'Upcoming payments'),fakeDb({...workspace(),records:[flat]}),clock);
 assert.match(mortgage.replies[0].text,/<b>4 October 2026<\/b>\n• Flat · UZS.900,000/);
 const settled=await handleTelegramUpdate(message(500,'Upcoming payments'),fakeDb({...workspace(),records:[flat],mortgagePayments:[{mortgage_id:flat.id,paid_on:'2026-10-01'}]}),clock);
 assert.equal(settled.replies[0].text,'No payments due in the next 31 days.');
});

test('database failures surface so the webhook can ask Telegram to retry',async()=>{
 const db=fakeDb({subscriptions:[pending],failWrites:true});
 await assert.rejects(handleTelegramUpdate(message(500,'/start ABCDEFGH'),db,clock),/Database request failed/);
});

test('pressing Back in the chat returns to the previous question, stores the shorter draft and saves the corrected choice',async()=>{
 const db=fakeDb(workspace());
 await handleTelegramUpdate(message(500,'Expense'),db,clock);
 await handleTelegramUpdate(press(500,'f:cat:'+id(20)),db,clock);
 await handleTelegramUpdate(press(500,'f:acc:'+id(1)),db,clock);
 assert.deepEqual(db.drafts.map(d=>d.step),['expense:amount']);
 // The owner meant the card account: Back, then the other choice.
 const back=await handleTelegramUpdate(press(500,'f:back'),db,clock);
 assert.equal(back.callbackId,'cb-f:back');
 assert.equal(back.replies[0].text,'From which account?');
 assert.deepEqual(db.drafts.map(d=>d.step),['expense:account']);
 assert.equal(db.drafts[0].data.account_id,undefined);assert.equal(db.drafts[0].data.category_name,'Groceries');
 const amount=await handleTelegramUpdate(press(500,'f:acc:'+id(2)),db,clock);
 assert.equal(amount.replies[0].text,'Type the amount in USD');
 await handleTelegramUpdate(message(500,'40'),db,clock);
 await handleTelegramUpdate(press(500,'f:skip'),db,clock);
 await handleTelegramUpdate(press(500,'f:date:today'),db,clock);
 const before=db.writes.length;
 await handleTelegramUpdate(press(500,'f:save'),db,clock);
 const rpc=db.writes.slice(before).find(write=>write.path==='/rest/v1/rpc/telegram_save_finance_record');
 assert.equal(rpc.body.p_record.currency,'USD');assert.equal(rpc.body.p_record.amount,40);assert.equal(rpc.body.p_record.account_id,id(2));
 // Back at the first question asks it again and never leaves the conversation.
 await handleTelegramUpdate(message(500,'Expense'),db,clock);
 const first=await handleTelegramUpdate(press(500,'f:back'),db,clock);
 assert.equal(first.replies[0].text,'Choose an expense category');assert.deepEqual(db.drafts.map(d=>d.step),['expense:category']);
});
