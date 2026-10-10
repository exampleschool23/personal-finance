import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';
import {deliveryTable,recordsFor} from './helpers/telegram-cron.mjs';
const {digestMessage,paymentsSection}=loadTS('lib/digest-message.ts');
const today='2026-09-30';
const record=(name,kind,amount,currency='UZS')=>({id:name,name,kind,amount,currency,date:today,frequency:'Monthly',quantity:0,cost:0,rate:0,notes:''});
const items=[
 {amount:3000000,key:'a',record:record('Rent','Rent expense',3000000),date:'2026-09-28',overdue:true,type:'scheduled'},
 {amount:1200,key:'b',record:record('Salary <sept>','Salary',1200,'USD'),date:today,overdue:false,type:'scheduled'},
 {amount:400,key:'c',record:record('Car loan','Loan',400,'USD'),date:'2026-10-02',overdue:false,type:'repayment'},
 {amount:5000,key:'d',record:record('Term deposit','Deposit',5000,'USD'),date:'2026-10-02',overdue:false,type:'maturity'},
];

const sun='\u2600\uFE0F',greeting=sun+' <b>Good morning, Aziz</b>\n<i>Every record you add makes tomorrow easier to plan.</i>';

const rates={UZS:12000};
test('the digest greets the owner by name, then lists overdue items first and each day, with income marked and names escaped',()=>{
 const text=digestMessage(items,'en',today,{name:'Aziz',currency:'USD',rates});
 assert.equal(text,[
  greeting,
  '',
  '<b>Upcoming payments</b> · 30 September 2026',
  '',
  '<b>Overdue</b>',
  '• Rent · UZS\u00a03,000,000 · 28 September 2026',
  '',
  '<b>Today</b>',
  '• Salary &lt;sept&gt; · +$1,200 · income',
  '',
  '<b>2 October 2026</b>',
  '• Car loan · $400 · repayment',
  '• Term deposit · $5,000 · deposit maturity',
 ].join('\n'));
});

test('without a name the greeting stands alone, a name is escaped, and the line of encouragement rotates by day',()=>{
 assert.ok(digestMessage([],'en',today).startsWith(sun+' <b>Good morning</b>\n<i>Every record'));
 assert.match(digestMessage([],'en',today,{name:'<b>X</b>'}),/Good morning, &lt;b&gt;X&lt;\/b&gt;/);
 const lines=new Set(['2026-09-30','2026-10-01','2026-10-02','2026-10-03'].map(day=>/<i>(.+)<\/i>/.exec(digestMessage([],'en',day))[1]));
 assert.equal(lines.size,4);
});

test('a day with nothing due still sends the greeting and says so',()=>{
 assert.equal(digestMessage([],'en',today,{name:'Aziz'}),greeting+'\n\nNothing is due soon.');
});

test('net worth shows its change since yesterday, signed, and omits a change that rounds to nothing',()=>{
 assert.match(digestMessage([],'en',today,{currency:'USD',netWorth:{amount:12500.4,change:310.2}}),/📈 Net worth: \$12,500 · \+\$310 since yesterday$/);
 assert.match(digestMessage([],'en',today,{currency:'USD',netWorth:{amount:12500,change:-80}}),/· −\$80 since yesterday$/);
 for(const change of [0,0.2,null])assert.match(digestMessage([],'en',today,{currency:'USD',netWorth:{amount:12500,change}}),/📈 Net worth: \$12,500$/);
});

test('spending is compared with the week before in plain words, whichever way it went',()=>{
 const text=(current,previous)=>digestMessage([],'en',today,{currency:'USD',spending:{current,previous}});
 assert.match(text(400,650),/🧾 Last 7 days you spent \$400, \$250 less than the week before\.$/);
 assert.match(text(900,650),/🧾 Last 7 days you spent \$900, \$250 more than the week before\.$/);
 assert.match(text(400,0),/🧾 Last 7 days you spent \$400\.$/);
 assert.match(text(400,400),/🧾 Last 7 days you spent \$400\.$/);
 assert.doesNotMatch(text(0,0),/🧾/);
 assert.match(text(0,300),/Last 7 days you spent \$0, \$300 less/);
});

test('the digest is translated',()=>{
 const ru=digestMessage(items,'ru',today,{name:'Азиз',currency:'UZS',rates});
 assert.ok(ru.startsWith(sun+' <b>Доброе утро, Азиз</b>\n<i>'));
 assert.match(ru,/<b>Предстоящие платежи<\/b> · 30 сентября 2026\n\n<b>Просрочено<\/b>\n• Rent · 3\s000\s000\sUZS · 28 сентября 2026\n\n<b>Сегодня<\/b>/);
 assert.match(ru,/погашение/);
 assert.match(digestMessage(items,'uz',today,{currency:'UZS',rates}),/<b>.+<\/b> · 30 sentabr 2026\n\n<b>.+<\/b>\n• Rent · 3\s000\s000\sso.m/);
 assert.match(digestMessage([],'de',today,{spending:{current:10,previous:30}}),/Guten Morgen/);
});

test('the bot\'s Upcoming answer is the payments block alone, with no greeting',()=>{
 assert.equal(paymentsSection([],'en',today,{currency:'USD'}),null);
 assert.match(paymentsSection(items,'en',today,{currency:'USD',rates}),/^<b>Upcoming payments<\/b> · 30 September 2026\n\n<b>Overdue<\/b>/);
});

test('every payment is shown as entered, in its own currency, whatever the display currency, and needs no rate',()=>{
 // The user's rule (10 October 2026): one payment reads as it was entered; only totals convert.
 for(const display of [{currency:'UZS',rates},{currency:'EUR',rates},{currency:'USD'}]){
  const text=paymentsSection(items,'en',today,display);
  assert.match(text,/• Salary &lt;sept&gt; · \+\$1,200 · income/);assert.match(text,/• Rent · UZS\u00a03,000,000/);
  assert.doesNotMatch(text,/Exchange rate unavailable|—/);
 }
 assert.match(digestMessage(items,'ru',today,{currency:'USD'}),/1\s200\s\$/);
});

test('the digest cron is scheduled in the morning and documented',()=>{
 const vercel=JSON.parse(fs.readFileSync('vercel.json','utf8'));
 assert.deepEqual(vercel.crons.find(cron=>cron.path==='/api/cron/telegram-digest'),{path:'/api/cron/telegram-digest',schedule:'0 4 * * *'});
 assert.match(fs.readFileSync('VERCEL.md','utf8'),/telegram-digest/);
});

function cronRoute({subscriptions,records={},splits={},links={},occurrences={},languages={},names={},currencies={},snapshots={},reminders={},sendResult=true,failFor='',deliveries=deliveryTable()}){
 const sent=[],reads=[];
 const db={
  async read(path){
   reads.push(path);
   const owner=/user_id=eq\.([\w-]+)/.exec(path)?.[1];
   if(failFor&&owner===failFor)throw Error('Database request failed.');
   if(path.startsWith('/rest/v1/telegram_subscriptions'))return subscriptions;
   if(path.startsWith('/rest/v1/finance_records'))return recordsFor(records[owner]??[],path);
   if(path.startsWith('/rest/v1/payment_occurrences'))return occurrences[owner]??[];
   if(path.startsWith('/rest/v1/user_preferences'))return owner in languages||owner in names||owner in currencies?[{language:languages[owner],display_name:names[owner],currencies:currencies[owner]}]:[];
   if(path.startsWith('/rest/v1/portfolio_snapshots'))return [...(snapshots[owner]??[])].reverse();
   if(path.startsWith('/rest/v1/workspace_preferences'))return owner in reminders?[{data:reminders[owner]}]:[];
   if(path.startsWith('/rest/v1/account_activity')||path.startsWith('/rest/v1/mortgage_payments'))return [];
   if(path.startsWith('/rest/v1/transaction_splits'))return splits[owner]??[];
   if(path.startsWith('/rest/v1/investment_account_links'))return links[owner]??[];
   throw Error('unexpected '+path);
  },
  // The digest writes nothing but its delivery claims.
  write:deliveries.write,
 };
 const route=loadTS('app/api/cron/telegram-digest/route.ts',{
  '@/lib/service-role':{serviceDatabase:()=>db},
  '@/lib/telegram':{telegramConfig:()=>({token:'T',webhookSecret:'S',botUsername:'b'}),deliverTelegramMessage:async message=>{sent.push(message);return sendResult;},escapeHtml:text=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')},
  '@/lib/deposit-interest':{...loadTS('lib/deposit-interest.ts'),depositToday:()=>'2026-09-30'},
 });
 return {sent,reads,deliveries,GET:()=>route.GET(new Request('https://local',{headers:{authorization:'Bearer test-secret'}}))};
}
const rent={id:'rent',name:'Rent',kind:'Rent expense',amount:3000000,currency:'UZS',date:'2026-09-01',frequency:'Monthly',quantity:0,cost:0,rate:0,notes:''};

test('the digest never shows a week\'s spending that left out amounts without a rate',()=>{
 const text=digestMessage([],'en','2026-09-30',{spending:{current:40,previous:30,missing:true}});
 assert.match(text,/🧾 Spending: Exchange rate unavailable\./);assert.doesNotMatch(text,/Last 7 days/);
 assert.match(digestMessage([],'en','2026-09-30',{spending:{current:40,previous:30}}),/Last 7 days you spent \$40/);
});

test('the cron sends one digest per linked owner in their language and window, greeting them by the name saved in the app',async()=>{
 process.env.CRON_SECRET='test-secret';
 const cron=cronRoute({subscriptions:[{user_id:'anna',chat_id:1},{user_id:'bob',chat_id:2}],records:{anna:[rent],bob:[{...rent,id:'far',date:'2026-10-25'}]},languages:{anna:'ru'},names:{anna:'Анна'},reminders:{anna:{enabled:false,days_ahead:3,snoozed:[]}}});
 const response=await cron.GET();
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{sent:2,failed:0,blocked:0});
 assert.equal(cron.sent.length,2);assert.equal(cron.sent[0].chat_id,1);
 assert.match(cron.sent[0].text,/<b>Предстоящие платежи<\/b>/);assert.match(cron.sent[0].text,/Rent/);
 assert.match(cron.sent[0].text,/Доброе утро, Анна/);
 // The other owner has nothing due in the window but still gets a greeting, and no name when none is saved in the app.
 assert.match(cron.sent[1].text,/Good morning<\/b>/);assert.match(cron.sent[1].text,/Nothing is due soon\./);
 assert.ok(cron.reads.every(path=>!path.includes('telegram_subscriptions')||path.includes('chat_id=not.is.null&digest_enabled=is.true')));
 assert.ok(cron.reads.some(path=>path.includes('finance_records')&&path.includes('user_id=eq.anna')));
});

test('a snoozed item stays out of the digest and one failing owner does not block the rest',async()=>{
 process.env.CRON_SECRET='test-secret';
 const cron=cronRoute({subscriptions:[{user_id:'broken',chat_id:9},{user_id:'anna',chat_id:1}],records:{anna:[{...rent,date:'2026-10-01'},{...rent,id:'car',name:'Car loan',kind:'Loan',amount:400,currency:'USD',date:'2026-10-03',frequency:'Once'}]},reminders:{anna:{enabled:true,days_ahead:7,snoozed:[{key:'rent:2026-10-01',until:'2026-10-05'}]}},failFor:'broken'});
 const response=await cron.GET();
 assert.equal(response.status,503);
 assert.deepEqual(await response.json(),{sent:1,failed:1,blocked:0});
 assert.equal(cron.sent.length,1);
 assert.ok(!cron.sent[0].text.includes('Rent'));assert.ok(cron.sent[0].text.includes('Car loan'));
});

test('the cron refuses a missing or wrong secret before touching the database',async()=>{
 process.env.CRON_SECRET='test-secret';
 const cron=cronRoute({subscriptions:[{user_id:'anna',chat_id:1}]});
 const route=loadTS('app/api/cron/telegram-digest/route.ts',{'@/lib/service-role':{serviceDatabase:()=>{throw Error('must not be called');}}});
 assert.equal((await route.GET(new Request('https://local'))).status,401);
 assert.equal((await route.GET(new Request('https://local',{headers:{authorization:'Bearer wrong'}}))).status,401);
 assert.equal(cron.reads.length,0);
 const unconfigured=loadTS('app/api/cron/telegram-digest/route.ts',{'@/lib/service-role':{serviceDatabase:()=>null}});
 assert.equal((await unconfigured.GET(new Request('https://local',{headers:{authorization:'Bearer test-secret'}}))).status,503);
});

test('a long payment list stays within one Telegram message and says how many items it left out',()=>{
 // Live QA 2026-10-03: 137 items (96 overdue) made a 5,660-character reply that Telegram refused, so the bot stayed silent.
 const many=Array.from({length:137},(_,index)=>({amount:45,key:'k'+index,record:record('QA Gym membership '+index,'Living expense',45,'USD'),date:index<96?'2026-09-'+String(1+index%28).padStart(2,'0'):'2026-10-'+String(1+index%28).padStart(2,'0'),overdue:index<96,type:'scheduled'}));
 const text=digestMessage(many,'en',today,{name:'Aziz',netWorth:{amount:241100,change:-784},spending:{current:4207,previous:3935}});
 assert.ok(text.length<4096,'digest is '+text.length+' characters');
 const shown=(text.match(/^• QA Gym/gm)||[]).length;
 assert.ok(shown>0&&shown<137);
 assert.match(text,new RegExp('• '+(137-shown)+' more$','m'));
 // At most ten overdue items, newest first, so the days ahead still appear.
 assert.equal((text.split('<b>Overdue</b>')[1].split('\n\n')[0].match(/^• QA Gym/gm)||[]).length,10);
 assert.match(text,/<b>1 October 2026<\/b>/);
 // A short list is unchanged: no "more" line.
 assert.doesNotMatch(paymentsSection(items,'en',today,{currency:'USD',rates}),/more/);
});

test('the digest and the recap share one subscriber loop: only linked private chats with the digest on, each owner counted on its own',async()=>{
 const {deliverToSubscribers,digestSubscribersPath}=loadTS('lib/telegram-owner.ts');
 assert.match(digestSubscribersPath,/chat_id=not\.is\.null/);assert.match(digestSubscribersPath,/digest_enabled=is\.true/);
 assert.match(digestSubscribersPath,/chat_id=gt\.0/,'a group chat (negative id) never receives a digest');
 const reads=[],delivered=[],deliveries=deliveryTable(),digest={kind:'digest',period:'2026-09-30'};
 const db={read:async path=>{reads.push(path);return [{user_id:'a',chat_id:1},{user_id:'b',chat_id:2},{user_id:'c',chat_id:3}];},write:deliveries.write};
 const counts=await deliverToSubscribers(db,digest,async subscriber=>{delivered.push(subscriber.chat_id);if(subscriber.user_id==='b')throw Error('boom');return subscriber.user_id==='a';});
 assert.deepEqual(counts,{sent:1,failed:2,blocked:0});assert.deepEqual(delivered,[1,2,3]);assert.deepEqual(reads,[digestSubscribersPath+'&limit=500&offset=0']);
 // Only the delivered message keeps its claim; the failed ones are given back for a retry.
 assert.deepEqual(deliveries.rows,[{user_id:'a',...digest}]);
 await assert.rejects(deliverToSubscribers({read:async()=>{throw Error('down');}},digest,async()=>true),/down/);
 // A claim that cannot be written counts as a failure, and nothing is sent.
 const unsent=[];
 assert.deepEqual(await deliverToSubscribers({read:async()=>[{user_id:'a',chat_id:1}],write:async()=>new Response(null,{status:500})},digest,async()=>{unsent.push(1);return true;}),{sent:0,failed:1,blocked:0});
 assert.deepEqual(unsent,[]);
 for(const file of ['app/api/cron/telegram-digest/route.ts','app/api/cron/telegram-recap/route.ts']){
  const source=fs.readFileSync(file,'utf8');
  assert.match(source,/deliverToSubscribers\(db,/,file);assert.doesNotMatch(source,/telegram_subscriptions/,file);
 }
});

test('a retried digest run sends nothing twice, and a digest that failed is sent on the retry',async()=>{
 process.env.CRON_SECRET='test-secret';
 const deliveries=deliveryTable();
 const subscriptions=[{user_id:'anna',chat_id:1},{user_id:'bob',chat_id:2}];
 const first=cronRoute({subscriptions,failFor:'bob',deliveries});
 assert.deepEqual(await (await first.GET()).json(),{sent:1,failed:1,blocked:0});
 assert.deepEqual(deliveries.rows,[{user_id:'anna',kind:'digest',period:'2026-09-30'}]);
 // The retry (or a second run that overlaps it) reaches only Bob.
 const retry=cronRoute({subscriptions,deliveries});
 const response=await retry.GET();
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{sent:1,failed:0,blocked:0});
 assert.deepEqual(retry.sent.map(message=>message.chat_id),[2]);
 const again=cronRoute({subscriptions,deliveries});
 assert.deepEqual(await (await again.GET()).json(),{sent:0,failed:0,blocked:0});assert.equal(again.sent.length,0);
 // A message Telegram refused keeps no claim, so the next run tries it again.
 const refused=deliveryTable(),declined=cronRoute({subscriptions:[{user_id:'anna',chat_id:1}],sendResult:false,deliveries:refused});
 assert.equal((await declined.GET()).status,503);assert.deepEqual(refused.rows,[]);
 // The next day is a new digest.
 assert.ok(!deliveries.rows.some(row=>row.period!=='2026-09-30'));
});

test('the digest reads schedules and holdings in full but cash flow only for the weeks it compares',async()=>{
 process.env.CRON_SECRET='test-secret';
 const old={id:'old',name:'Groceries',kind:'Living expense',amount:999,currency:'USD',date:'2026-08-01',frequency:'Once'};
 const recent={...old,id:'recent',amount:40,date:'2026-09-29'};
 const cron=cronRoute({subscriptions:[{user_id:'anna',chat_id:1}],records:{anna:[rent,old,recent]}});
 await cron.GET();
 const recordReads=cron.reads.filter(path=>path.startsWith('/rest/v1/finance_records'));
 assert.equal(recordReads.length,2);
 assert.ok(recordReads.some(path=>path.includes('frequency=eq.Once')&&path.includes('date=gte.2026-09-17')&&!path.includes('select=*')),'cash flow from two weeks back, narrow columns');
 assert.ok(recordReads.every(path=>path.includes('order=id.asc')&&path.includes('limit=500')),'paged by id');
 assert.ok(cron.reads.some(path=>path.startsWith('/rest/v1/account_activity')&&path.includes('action=in.(repayment,mortgage)')));
 assert.match(cron.sent[0].text,/Rent/);
});

test('background work over many owners runs a few at a time, finishes every item and stops after a failure',async()=>{
 const {forEachLimited}=loadTS('lib/bounded-concurrency.ts');
 let open=0,peak=0;const done=[];
 await forEachLimited(Array.from({length:20},(_,index)=>index),3,async item=>{open++;peak=Math.max(peak,open);await new Promise(resolve=>setTimeout(resolve,1));open--;done.push(item);});
 assert.equal(peak,3);assert.deepEqual([...done].sort((a,b)=>a-b),Array.from({length:20},(_,index)=>index));
 await forEachLimited([],8,async()=>{throw Error('never called');});
 const started=[];
 await assert.rejects(forEachLimited([1,2,3,4,5],1,async item=>{started.push(item);if(item===2)throw Error('capture failed');}),/capture failed/);
 assert.deepEqual(started,[1,2],'no new item starts after a failure');
});

test('the bot\'s Upcoming payments answer shows each bill as entered, in its own currency, reading paid debts in pages',async()=>{
 const {upcomingReply}=loadTS('lib/telegram-bot/replies.ts');
 const reads=[];
 const db=(activity=[])=>({async read(path){
  reads.push(path);
  if(path.startsWith('/rest/v1/finance_records'))return recordsFor([{...rent,currency:'USD',amount:500,date:'2026-09-02'}],path);
  if(path.startsWith('/rest/v1/account_activity'))return path.includes('offset=0')?activity:[];
  if(path.startsWith('/rest/v1/payment_occurrences')||path.startsWith('/rest/v1/mortgage_payments'))return [];
  throw Error('unexpected '+path);
 }});
 // A USD bill reads in dollars although the primary currency is UZS: no rate is needed, so neither preferences nor snapshots are read.
 const text=await upcomingReply(db(),'anna','en',today);
 assert.match(text,/• Rent · \$500/);assert.doesNotMatch(text,/Exchange rate unavailable/);
 assert.ok(!reads.some(path=>path.startsWith('/rest/v1/user_preferences')||path.startsWith('/rest/v1/portfolio_snapshots')));
 for(const table of ['account_activity','mortgage_payments'])assert.ok(reads.some(path=>path.startsWith('/rest/v1/'+table)&&path.includes('limit=500&offset=0')),table+' is paged');
 // A full page of repayments asks for the next one.
 reads.length=0;
 await upcomingReply(db(Array.from({length:500},()=>({action:'repayment',target_id:null,occurred_on:'2026-09-01'}))),'anna','en',today);
 assert.ok(reads.some(path=>path.startsWith('/rest/v1/account_activity')&&path.includes('offset=500')));
});

test('a chat that blocked the bot keeps its claim, has its digest switched off and is not counted as a failure; a refused release is reported',async()=>{
 // Review BOT-005: a blocked bot failed every run, gave the claim back and alerted the operator forever.
 const reported=[];
 const {deliverToSubscribers}=loadTS('lib/telegram-owner.ts',{'./monitoring':{reportError:async(...args)=>{reported.push(args);}}});
 const deliveries=deliveryTable(),patches=[],digest={kind:'digest',period:'2026-09-30'};
 const db={read:async()=>[{user_id:'a',chat_id:1},{user_id:'b',chat_id:2},{user_id:'c',chat_id:3}],async write(path,init){
  if(path.startsWith('/rest/v1/telegram_subscriptions')){patches.push({path,method:init.method,body:JSON.parse(init.body)});return new Response(null,{status:204});}
  return deliveries.write(path,init);
 }};
 const outcomes={a:'sent',b:'blocked',c:'failed'};
 assert.deepEqual(await deliverToSubscribers(db,digest,async({user_id})=>outcomes[user_id]),{sent:1,failed:1,blocked:1});
 assert.deepEqual(deliveries.rows.map(row=>row.user_id),['a','b'],'the blocked chat keeps its claim; the failed one is given back');
 assert.equal(patches.length,1);assert.equal(patches[0].method,'PATCH');assert.match(patches[0].path,/user_id=eq\.b&chat_id=eq\.2/);
 assert.equal(patches[0].body.digest_enabled,false);assert.equal('chat_id' in patches[0].body,false,'the chat stays linked');
 // When switching the digest off fails, the message counts as failed and is tried again.
 const failing=deliveryTable();
 assert.deepEqual(await deliverToSubscribers({read:db.read,write:(path,init)=>path.startsWith('/rest/v1/telegram_subscriptions')?Promise.resolve(new Response(null,{status:500})):failing.write(path,init)},digest,async()=>'blocked'),{sent:0,failed:3,blocked:0});
 assert.deepEqual(failing.rows,[]);
 // A claim that cannot be given back is reported, and the run goes on.
 assert.equal(reported.length,0);
 const stuck=deliveryTable();
 assert.deepEqual(await deliverToSubscribers({read:async()=>[{user_id:'a',chat_id:1}],write:(path,init)=>init.method==='DELETE'?Promise.resolve(new Response(null,{status:500})):stuck.write(path,init)},digest,async()=>false),{sent:0,failed:1,blocked:0});
 assert.equal(reported.length,1);assert.equal(reported[0][0],'telegram-delivery');
});

test('the digest cron answers 200 and raises no alert when the only undelivered digests went to chats that blocked the bot',async()=>{
 process.env.CRON_SECRET='test-secret';
 const table=deliveryTable(),muted=[];
 const cron=cronRoute({subscriptions:[{user_id:'anna',chat_id:1}],sendResult:'blocked',deliveries:{rows:table.rows,write:(path,init)=>path.startsWith('/rest/v1/telegram_subscriptions')?(muted.push(path),Promise.resolve(new Response(null,{status:204}))):table.write(path,init)}});
 const response=await cron.GET();
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{sent:0,failed:0,blocked:1});
 assert.equal(muted.length,1);assert.equal(table.rows.length,1,'not retried on the next run');
});

test('sending tells a chat that refuses the bot for good apart from a failure a retry may fix',async()=>{
 const {deliverTelegramMessage,sendTelegramMessage}=loadTS('lib/telegram.ts');
 const config={token:'T',webhookSecret:'S',botUsername:'b'},reply=(status,description)=>async()=>Response.json({ok:false,error_code:status,description},{status});
 assert.equal(await deliverTelegramMessage({chat_id:1,text:'hi'},config,async()=>Response.json({ok:true})),'sent');
 assert.equal(await deliverTelegramMessage({chat_id:1,text:'hi'},config,reply(403,'Forbidden: bot was blocked by the user')),'blocked');
 assert.equal(await deliverTelegramMessage({chat_id:1,text:'hi'},config,reply(403,'Forbidden: user is deactivated')),'blocked');
 assert.equal(await deliverTelegramMessage({chat_id:1,text:'hi'},config,reply(400,'Bad Request: chat not found')),'blocked');
 assert.equal(await deliverTelegramMessage({chat_id:1,text:'hi'},config,reply(400,"Bad Request: can't parse entities")),'failed');
 assert.equal(await deliverTelegramMessage({chat_id:1,text:'hi'},config,reply(429,'Too Many Requests')),'failed');
 assert.equal(await deliverTelegramMessage({chat_id:1,text:'hi'},config,async()=>new Response('not json',{status:400})),'failed');
 assert.equal(await deliverTelegramMessage({chat_id:1,text:'hi'},config,async()=>{throw Error('offline');}),'failed');
 assert.equal(await deliverTelegramMessage({chat_id:1,text:'hi'},null),'failed');
 // Existing callers still get a plain yes or no.
 assert.equal(await sendTelegramMessage({chat_id:1,text:'hi'},config,reply(403,'Forbidden: bot was blocked by the user')),false);
 assert.equal(await sendTelegramMessage({chat_id:1,text:'hi'},config,async()=>Response.json({ok:true})),true);
});
