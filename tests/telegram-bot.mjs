import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
import {recordsFor} from './helpers/telegram-cron.mjs';
const {handleTelegramUpdate}=loadTS('lib/telegram-bot.ts');
const now=new Date('2026-09-30T09:00:00Z');
const clock={now,today:'2026-09-30',newId:()=>'99999999-9999-4999-8999-999999999999'};
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const id=n=>`77000000-0000-4000-8000-0000000000${String(n).padStart(2,'0')}`;
const entry=(n,name,kind,amount,currency='UZS')=>({id:id(n),user_id:owner,name,kind,amount,currency,quantity:0,cost:0,rate:0,date:'2026-01-01',frequency:'Once',notes:''});
function fakeDb({subscriptions=[],languages={},records=[],categories=[],occurrences=[],activity=[],mortgagePayments=[],drafts=[],failWrites=false,rpcFailure=null,rules=null,currencies}={}){
 const writes=[],reads=[];
 return {writes,drafts,reads,
  async read(path){
   reads.push(path);
   const owner=/user_id=eq\.([\w-]+)/.exec(path)?.[1];
   if(rules&&path.startsWith('/rest/v1/transaction_rules'))return rules.filter(rule=>rule.user_id===owner);
   if(path.startsWith('/rest/v1/telegram_subscriptions')){
    const chat=/chat_id=eq\.(\d+)/.exec(path);
    return subscriptions.filter(s=>chat?s.chat_id===Number(chat[1]):true);
   }
   if(path.startsWith('/rest/v1/user_preferences'))return owner in languages?[{language:languages[owner],...(currencies?{currencies}:{})}]:[];
   if(path.startsWith('/rest/v1/finance_records')){
    // Pages like PostgREST: by offset or after an id, and a read without a range still stops at 1,000 rows.
    const rows=recordsFor(records.filter(r=>r.user_id===owner),path),range=/limit=(\d+)&offset=(\d+)/.exec(path);
    const params=new URLSearchParams(path.split('?')[1]),after=params.get('id')?.slice(3);
    if(params.get('order')==='id.asc'&&!range)return [...rows].sort((a,b)=>a.id.localeCompare(b.id)).filter(row=>!after||row.id>after).slice(0,Number(params.get('limit')??1000));
    return range?rows.slice(Number(range[2]),Number(range[2])+Number(range[1])):rows.slice(0,1000);
   }
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
const pending={user_id:owner,chat_id:null,digest_enabled:true,actions_enabled:true,linked_at:null};
const linked={user_id:owner,chat_id:500,digest_enabled:true,actions_enabled:true,linked_at:'2026-09-29T00:00:00Z'};
const message=(chat,text,language_code)=>({message:{chat:{id:chat},text,from:{language_code}}});
const press=(chat,data)=>({callback_query:{id:'cb-'+data,data,message:{chat:{id:chat}}}});
const workspace=()=>({subscriptions:[linked],languages:{[owner]:'en'},records:[entry(1,'Wallet','Cash',900000),entry(2,'Card','Cash',300,'USD'),entry(10,'Car loan','Loan',2000,'USD')],categories:[{id:id(20),name:'Groceries',direction:'expense'}]});

test('a code after /start never links a chat: a stranger is invited, a linked chat sees its menu, and nothing is written',async()=>{
 const stranger=fakeDb({subscriptions:[pending],languages:{[owner]:'ru'}});
 for(const text of ['/start ABCDEFGH','/start@hoggish_bot abcdefgh','/start 0000'])
  assert.match((await handleTelegramUpdate(message(500,text,'en'),stranger,clock)).replies.map(reply=>reply.text).join('\n'),/Welcome to Hoggish/,text);
 assert.equal(stranger.writes.length,0);
 const owned=fakeDb({subscriptions:[linked],languages:{[owner]:'ru'}});
 const menu=await handleTelegramUpdate(message(500,'/start ABCDEFGH'),owned,clock);
 assert.match(menu.replies[0].text,/^Подключено\./);assert.deepEqual(menu.replies[0].keyboard.reply[0],['Расход','Доходы']);
 assert.equal(owned.writes.length,0);
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
 assert.equal(menu.replies[0].text,'Choose what to add, or type it, like coffee 4.5 or +1,500 salary.');
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
 // Records reach the bot sorted by name; the primary currency (UZS) picks the account of a typed entry.
 const stale=fakeDb({...workspace(),currencies:['UZS'],drafts:[{user_id:owner,step:'expense:amount',data:{account_id:id(1)},updated_at:'2026-09-30T08:00:00Z'}]});
 // The old question is gone, so the number is read as a new typed entry and only proposed, never saved.
 const fresh=await handleTelegramUpdate(message(500,'250000'),stale,clock);
 assert.match(fresh.replies[0].text,/^<b>Save this\?<\/b>\nExpense · Other expense\n<b>Other expense<\/b> · UZS\s250,000/);
 assert.ok(!stale.writes.some(write=>write.path.startsWith('/rest/v1/rpc/')));
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
 assert.equal((await handleTelegramUpdate(press(500,'f:back'),refused,clock)).replies[0].text,'Which day? Choose, or type a date like 30 September 2026');
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
 const db=fakeDb({subscriptions:[linked],languages:{[owner]:'en'},failWrites:true});
 await assert.rejects(handleTelegramUpdate(message(500,'/stop'),db,clock),/Database request failed/);
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

const env=(rates)=>({appOrigin:null,loginSecret:null,admin:null,rates});
const both=()=>({...workspace(),currencies:['UZS','USD']});
test('a typed message becomes a card read with the owner\'s own rules, and only Save writes the record',async()=>{
 const rule={user_id:owner,id:'r1',pattern:'bazaar',match:'contains',direction:'expense',account_id:null,match_business_id:null,match_kind:null,match_category_id:null,amount_min:null,amount_max:null,kind:'Other expense',category_id:id(20),business_id:null,tag_ids:[],created_at:'2026-01-01'};
 const foreign={...rule,user_id:other,id:'r2',category_id:id(21)};
 const db=fakeDb({...both(),rules:[rule,foreign]});
 const card=await handleTelegramUpdate(message(500,'Bazaar 120 000'),db,clock,env());
 assert.match(card.replies[0].text,/^<b>Save this\?<\/b>\nExpense · Groceries\n<b>Bazaar<\/b> · UZS\s120,000/);
 assert.ok(db.reads.some(path=>path==='/rest/v1/transaction_rules?select=*&user_id=eq.'+owner+'&order=created_at.desc'),'rules are read for this owner only');
 assert.ok(!db.writes.some(write=>write.path.startsWith('/rest/v1/rpc/')),'nothing saved before Save');
 assert.equal(db.drafts[0].step,'expense:confirm');assert.equal(db.drafts[0].data.typed,true);
 const saved=await handleTelegramUpdate(press(500,'f:save'),db,clock,env());
 const rpc=db.writes.find(write=>write.path==='/rest/v1/rpc/telegram_save_finance_record');
 assert.equal(rpc.body.p_record.custom_category_id,id(20));assert.equal(rpc.body.p_record.amount,120000);assert.equal(rpc.body.p_record.name,'Bazaar');
 assert.match(saved.replies[0].text,/^Saved\./);
 // Without the rules table (an older database) typed entries still work.
 assert.match((await handleTelegramUpdate(message(500,'coffee 4500'),fakeDb(both()),clock,env())).replies[0].text,/^<b>Save this\?<\/b>\nExpense · Living expense/);
});

test('a typed entry in another currency fetches the dated rate and saves it with the rate day; without one it asks',async()=>{
 const asked=[];
 const db=fakeDb(both());
 const card=await handleTelegramUpdate(message(500,'lunch 12 usd wallet yesterday'),db,clock,env(async(from,to,date)=>{asked.push([from,to,date]);return {rate:0.00008,effective_date:'2026-09-28'};}));
 assert.deepEqual(asked,[['UZS','USD','2026-09-29']]);
 assert.match(card.replies[0].text,/from Wallet · ≈ UZS\s150,000\n1 USD = 12,500 UZS/);
 await handleTelegramUpdate(press(500,'f:save'),db,clock,env(async()=>{throw Error('not asked again');}));
 const rpc=db.writes.find(write=>write.path==='/rest/v1/rpc/telegram_save_finance_record');
 assert.deepEqual({currency:rpc.body.p_record.currency,amount:rpc.body.p_record.amount,rate:rpc.body.p_record.account_exchange_rate,day:rpc.body.p_record.account_rate_date,account:rpc.body.p_record.account_currency},{currency:'USD',amount:12,rate:0.00008,day:'2026-09-28',account:'UZS'});
 // The rate service is down: the owner is asked, and their figure is used.
 const offline=fakeDb(both());
 const question=await handleTelegramUpdate(message(500,'lunch 12 usd wallet'),offline,clock,env(async()=>{throw Error('Historical exchange rates are unavailable.');}));
 assert.equal(question.replies[0].text,'There is no USD to UZS exchange rate for 30 September 2026. How much is this in UZS, the currency of Wallet?');
 assert.equal(offline.drafts[0].step,'expense:fxamount');
 const confirm=await handleTelegramUpdate(message(500,'151200'),offline,clock,env(async()=>{throw Error('no');}));
 assert.match(confirm.replies[0].text,/≈ UZS\s151,200/);
 assert.ok(!offline.writes.some(write=>write.path.startsWith('/rest/v1/rpc/')));
});

test('a loan paid from an account in another currency goes through the dated-rate wrapper; an overdraft is explained in the account currency',async()=>{
 const db=fakeDb(both());
 const rates=env(async()=>({rate:0.00008,effective_date:'2026-09-30'}));
 await handleTelegramUpdate(message(500,'Pay loan or debt'),db,clock,rates);
 await handleTelegramUpdate(press(500,'f:tgt:'+id(10)),db,clock,rates);
 await handleTelegramUpdate(press(500,'f:acc:'+id(1)),db,clock,rates);
 await handleTelegramUpdate(message(500,'40'),db,clock,rates);
 const confirm=await handleTelegramUpdate(press(500,'f:date:today'),db,clock,rates);
 assert.match(confirm.replies[0].text,/\$40 · 30 September 2026\nfrom Wallet · ≈ UZS\s500,000/);
 await handleTelegramUpdate(press(500,'f:save'),db,clock,rates);
 const rpc=db.writes.find(write=>write.path==='/rest/v1/rpc/telegram_payment_with_fx');
 assert.deepEqual(rpc.body,{p_owner:owner,p_action:'repayment',p_data:{id:clock.newId(),account_id:id(1),target_id:id(10),amount:40,received:0,fee:0,date:'2026-09-30',notes:''},p_rate:0.00008,p_rate_date:'2026-09-30',p_account_currency:'UZS',p_record_currency:'USD'});
 const short=fakeDb({...both(),rpcFailure:{code:'P0001',message:'Insufficient balance.'}});
 for(const step of [message(500,'Pay loan or debt'),press(500,'f:tgt:'+id(10)),press(500,'f:acc:'+id(1)),message(500,'100'),press(500,'f:date:today')])await handleTelegramUpdate(step,short,clock,rates);
 const refused=await handleTelegramUpdate(press(500,'f:save'),short,clock,rates);
 assert.match(refused.replies[0].text,/Insufficient balance: Wallet has UZS\s900,000\./);
});

test('a long history does not hide schedules: the bot reads every record page by page',async()=>{
 const history=Array.from({length:1200},(_,n)=>({...entry(100+n,'A coffee '+n,'Other expense',10),id:`33333333-3333-4333-8333-${String(n).padStart(12,'0')}`}));
 const salary={...entry(11,'Zeta salary','Salary',5000),frequency:'Monthly'};
 const db=fakeDb({...workspace(),records:[...history,...workspace().records,salary]});
 await handleTelegramUpdate(message(500,'Income'),db,clock);
 const asked=await handleTelegramUpdate(press(500,'f:cat:Salary'),db,clock);
 assert.equal(asked.replies[0].text,'Which scheduled payment is this?');
 assert.ok(asked.replies[0].keyboard.inline.flat().some(button=>button.callback_data==='f:sch:'+id(11)));
});

test('each bot turn reads holdings and schedules in full but only the last year of cash flow, which still guides a typed entry',async()=>{
 const lunch={...entry(30,'Lunch','Charity',5),date:'2026-06-01'},ancient={...entry(31,'Ancient','Charity',5),date:'2024-01-01'};
 const db=fakeDb({...workspace(),records:[...workspace().records,lunch,ancient]});
 await handleTelegramUpdate(message(500,'Lunch 7'),db,clock);
 assert.equal(db.drafts[0].data.category,'Charity','the recent history names the category');
 const recordReads=db.reads.filter(path=>path.startsWith('/rest/v1/finance_records'));
 assert.ok(recordReads.length>0&&recordReads.every(path=>path.includes('order=id.asc')));
 const cashflow=recordReads.filter(path=>path.includes('frequency=eq.Once'));
 assert.ok(cashflow.length&&cashflow.every(path=>path.includes('date=gte.2025-09-01')&&!path.includes('select=*')));
 assert.ok(recordReads.filter(path=>!path.includes('frequency=eq.Once')).every(path=>path.includes('or=')),'no unfiltered history read');
});
