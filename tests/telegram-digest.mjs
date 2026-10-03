import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';
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

test('the digest greets the owner by name, then lists overdue items first and each day, with income marked and names escaped',()=>{
 const text=digestMessage(items,'en',today,{name:'Aziz'});
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
 const ru=digestMessage(items,'ru',today,{name:'Азиз'});
 assert.ok(ru.startsWith(sun+' <b>Доброе утро, Азиз</b>\n<i>'));
 assert.match(ru,/<b>Предстоящие платежи<\/b> · 30 сентября 2026\n\n<b>Просрочено<\/b>\n• Rent · 3\s000\s000\sUZS · 28 сентября 2026\n\n<b>Сегодня<\/b>/);
 assert.match(ru,/погашение/);
 assert.match(digestMessage(items,'uz',today),/<b>.+<\/b> · 30 sentabr 2026\n\n<b>.+<\/b>\n• Rent · 3\s000\s000\sso.m/);
 assert.match(digestMessage([],'de',today,{spending:{current:10,previous:30}}),/Guten Morgen/);
});

test('the bot\'s Upcoming answer is the payments block alone, with no greeting',()=>{
 assert.equal(paymentsSection([],'en',today),null);
 assert.match(paymentsSection(items,'en',today),/^<b>Upcoming payments<\/b> · 30 September 2026\n\n<b>Overdue<\/b>/);
});

test('the digest cron runs hourly so each owner gets it in their own morning, and is documented',()=>{
 const vercel=JSON.parse(fs.readFileSync('vercel.json','utf8'));
 assert.deepEqual(vercel.crons.find(cron=>cron.path==='/api/cron/telegram-digest'),{path:'/api/cron/telegram-digest',schedule:'0 * * * *'});
 assert.match(fs.readFileSync('VERCEL.md','utf8'),/telegram-digest/);
});

function cronRoute({subscriptions,records={},occurrences={},languages={},names={},currencies={},timezones={},snapshots={},reminders={},sendResult=true,failFor='',now='2026-09-30T08:30:00Z'}){
 const sent=[],reads=[],claims=[],releases=[];
 const db={
  async read(path){
   reads.push(path);
   const owner=/user_id=eq\.([\w-]+)/.exec(path)?.[1];
   if(failFor&&owner===failFor)throw Error('Database request failed.');
   if(path.startsWith('/rest/v1/telegram_subscriptions'))return subscriptions;
   if(path.startsWith('/rest/v1/finance_records'))return records[owner]??[];
   if(path.startsWith('/rest/v1/payment_occurrences'))return occurrences[owner]??[];
   if(path.startsWith('/rest/v1/user_preferences'))return owner in languages||owner in names||owner in currencies||owner in timezones?[{language:languages[owner],display_name:names[owner],currencies:currencies[owner],timezone:timezones[owner]}]:[];
   if(path.startsWith('/rest/v1/portfolio_snapshots'))return [...(snapshots[owner]??[])].reverse();
   if(path.startsWith('/rest/v1/workspace_preferences'))return owner in reminders?[{data:reminders[owner]}]:[];
   if(path.startsWith('/rest/v1/account_activity')||path.startsWith('/rest/v1/mortgage_payments'))return [];
   throw Error('unexpected '+path);
  },
  // The digest writes only its claim on the owner's local day, and gives it back when sending failed.
  async write(path,init){
   const owner=/user_id=eq\.([\w-]+)/.exec(path)[1],body=JSON.parse(init.body);
   assert.equal(init.method,'PATCH');assert.ok(path.startsWith('/rest/v1/telegram_subscriptions?'));
   const row=subscriptions.find(item=>item.user_id===owner);
   if(path.includes('&or=(')){
    if(row.digest_sent_on&&row.digest_sent_on>=body.digest_sent_on)return Response.json([]);
    claims.push([owner,body.digest_sent_on]);row.digest_sent_on=body.digest_sent_on;return Response.json([row]);
   }
   releases.push([owner,body.digest_sent_on]);row.digest_sent_on=body.digest_sent_on;return new Response(null,{status:204});
  },
 };
 const route=loadTS('app/api/cron/telegram-digest/route.ts',{
  '@/lib/service-role':{serviceDatabase:()=>db},
  '@/lib/telegram':{telegramConfig:()=>({token:'T',webhookSecret:'S',botUsername:'b'}),sendTelegramMessage:async message=>{sent.push(message);return sendResult;},escapeHtml:text=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')},
  '@/lib/timezones':{...loadTS('lib/timezones.ts'),currentInstant:()=>new Date(now)},
 });
 return {sent,reads,claims,releases,GET:()=>route.GET(new Request('https://local',{headers:{authorization:'Bearer test-secret'}}))};
}
const rent={id:'rent',name:'Rent',kind:'Rent expense',amount:3000000,currency:'UZS',date:'2026-09-01',frequency:'Monthly',quantity:0,cost:0,rate:0,notes:''};

test('the cron sends one digest per linked owner in their language and window, greeting them by the name saved in the app',async()=>{
 process.env.CRON_SECRET='test-secret';
 const cron=cronRoute({subscriptions:[{user_id:'anna',chat_id:1},{user_id:'bob',chat_id:2}],records:{anna:[rent],bob:[{...rent,id:'far',date:'2026-10-25'}]},languages:{anna:'ru'},names:{anna:'Анна'},reminders:{anna:{enabled:false,days_ahead:3,snoozed:[]}}});
 const response=await cron.GET();
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{sent:2,failed:0});
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
 assert.deepEqual(await response.json(),{sent:1,failed:1});
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

const zones=loadTS('lib/timezones.ts');
test('time zones: saved names are checked, a missing one comes from the country, then the language, then UTC',()=>{
 for(const good of ['Asia/Tashkent','America/New_York','America/Argentina/Buenos_Aires','UTC','Etc/GMT+5'])assert.ok(zones.isTimezone(good),good);
 for(const bad of ['','Mars/Olympus','Asia/Tashkent; drop','../etc/passwd',null,42,'x'.repeat(70)])assert.ok(!zones.isTimezone(bad),String(bad));
 assert.equal(zones.ownerTimezone('Europe/Paris','UZ','uz'),'Europe/Paris','a saved zone wins');
 assert.equal(zones.ownerTimezone(null,'UZ','en'),'Asia/Tashkent');
 assert.equal(zones.ownerTimezone(null,'US','en'),'America/New_York','a country with several zones uses its most populous');
 assert.equal(zones.ownerTimezone(null,'JP','en'),'Asia/Tokyo','a country with one zone uses it');
 assert.equal(zones.ownerTimezone('Bogus/Zone',null,'ja'),'Asia/Tokyo');
 assert.equal(zones.ownerTimezone(null,null,'ru'),'Europe/Moscow');
 // English, Spanish, French, Portuguese and Arabic are spoken in many countries, so they suggest nothing.
 for(const language of ['en','es','fr','pt','ar'])assert.equal(zones.ownerTimezone(null,'',language),'UTC',language);
});

test('the digest is due from 08:00 to noon local time, once per local day; the recap on Sunday evening',()=>{
 const at=iso=>new Date(iso);
 assert.deepEqual(zones.localClock(at('2026-09-30T22:30:00Z'),'Asia/Tashkent'),{date:'2026-10-01',hour:3,weekday:4});
 assert.deepEqual(zones.localClock(at('2026-10-01T03:00:00Z'),'America/New_York'),{date:'2026-09-30',hour:23,weekday:3});
 assert.equal(zones.digestDue(at('2026-09-30T03:00:00Z'),'Asia/Tashkent',null),'2026-09-30','08:00 in Tashkent');
 assert.equal(zones.digestDue(at('2026-09-30T02:59:00Z'),'Asia/Tashkent',null),null,'07:59 is too early');
 assert.equal(zones.digestDue(at('2026-09-30T07:00:00Z'),'Asia/Tashkent',null),null,'noon is too late');
 assert.equal(zones.digestDue(at('2026-09-30T03:00:00Z'),'Asia/Tashkent','2026-09-30'),null,'already sent today');
 assert.equal(zones.digestDue(at('2026-09-30T03:00:00Z'),'Asia/Tashkent','2026-09-29'),'2026-09-30');
 assert.equal(zones.digestDue(at('2026-09-30T12:00:00Z'),'America/New_York',null),'2026-09-30','08:00 in New York');
 assert.equal(zones.digestDue(at('2026-09-30T02:30:00Z'),'Asia/Kolkata',null),'2026-09-30','half-hour zones get it at 08:00 too');
 assert.equal(zones.recapDue(at('2026-10-04T13:00:00Z'),'Asia/Tashkent',null),'2026-10-04','18:00 on Sunday');
 assert.equal(zones.recapDue(at('2026-10-04T12:59:00Z'),'Asia/Tashkent',null),null);
 assert.equal(zones.recapDue(at('2026-10-04T13:00:00Z'),'Asia/Tashkent','2026-10-04'),null);
 assert.equal(zones.recapDue(at('2026-10-03T13:00:00Z'),'Asia/Tashkent',null),null,'Saturday');
 // Sunday evening in Tashkent is already Monday in Auckland.
 assert.equal(zones.recapDue(at('2026-10-04T13:00:00Z'),'Pacific/Auckland',null),null);
 const options=zones.timezoneOptions(at('2026-09-30T00:00:00Z'));
 assert.ok(options.length>300);assert.ok(options.some(option=>option.value==='Asia/Tashkent'&&option.label==='Asia/Tashkent · UTC+05:00'));
 assert.ok(options.some(option=>option.label==='America/St Johns · UTC−02:30'));
 assert.ok(options.findIndex(option=>option.value==='America/New_York')<options.findIndex(option=>option.value==='Asia/Tashkent'),'ordered by offset');
});

test('the hourly cron sends only in each owner\'s morning, never twice a day, and retries a failed send next hour',async()=>{
 process.env.CRON_SECRET='test-secret';
 const subscriptions=()=>[{user_id:'anna',chat_id:1},{user_id:'bob',chat_id:2},{user_id:'cid',chat_id:3,digest_sent_on:'2026-09-30'}];
 // 03:30 UTC: 08:30 in Tashkent, 23:30 the evening before in New York.
 const options={languages:{anna:'en',bob:'en',cid:'en'},timezones:{anna:'Asia/Tashkent',bob:'America/New_York',cid:'Asia/Tashkent'},now:'2026-09-30T03:30:00Z'};
 const first=cronRoute({...options,subscriptions:subscriptions()});
 assert.deepEqual(await (await first.GET()).json(),{sent:1,failed:0});
 assert.deepEqual(first.sent.map(message=>message.chat_id),[1]);assert.deepEqual(first.claims,[['anna','2026-09-30']]);
 // Owners outside their window are not read beyond their profile.
 assert.ok(!first.reads.some(path=>path.includes('finance_records')&&path.includes('user_id=eq.bob')));
 const again=cronRoute({...options,subscriptions:subscriptions().map(row=>row.user_id==='anna'?{...row,digest_sent_on:'2026-09-30'}:row)});
 assert.deepEqual(await (await again.GET()).json(),{sent:0,failed:0},'a second run that day sends nothing');
 const failing=cronRoute({...options,subscriptions:subscriptions(),sendResult:false});
 assert.equal((await failing.GET()).status,503);
 assert.deepEqual(failing.releases,[['anna',null]],'the day is given back so the next hour retries');
 // Nine hours later it is New York's morning.
 const later=cronRoute({...options,subscriptions:subscriptions(),now:'2026-09-30T12:30:00Z'});
 assert.deepEqual(await (await later.GET()).json(),{sent:1,failed:0});
 assert.equal(later.sent[0].chat_id,2);assert.deepEqual(later.claims,[['bob','2026-09-30']]);
 // At 20:00 UTC on 30 September it is 09:00 on 1 October in Auckland: the digest uses the owner's own calendar day.
 const auckland=cronRoute({subscriptions:[{user_id:'dee',chat_id:4,digest_sent_on:'2026-09-30'}],timezones:{dee:'Pacific/Auckland'},records:{dee:[rent]},now:'2026-09-30T20:00:00Z'});
 assert.deepEqual(await (await auckland.GET()).json(),{sent:1,failed:0});
 assert.deepEqual(auckland.claims,[['dee','2026-10-01']]);assert.match(auckland.sent[0].text,/<b>Upcoming payments<\/b> · 1 October 2026\n[\s\S]*<b>Today<\/b>\n• Rent/);
});
