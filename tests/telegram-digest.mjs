import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';
const {digestMessage,paymentsSection}=loadTS('lib/digest-message.ts');
const today='2026-09-30';
const record=(name,kind,amount,currency='UZS')=>({id:name,name,kind,amount,currency,date:today,frequency:'Monthly',quantity:0,cost:0,rate:0,notes:''});
const items=[
 {key:'a',record:record('Rent','Rent expense',3000000),date:'2026-09-28',overdue:true,type:'scheduled'},
 {key:'b',record:record('Salary <sept>','Salary',1200,'USD'),date:today,overdue:false,type:'scheduled'},
 {key:'c',record:record('Car loan','Loan',400,'USD'),date:'2026-10-02',overdue:false,type:'repayment'},
 {key:'d',record:record('Term deposit','Deposit',5000,'USD'),date:'2026-10-02',overdue:false,type:'maturity'},
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

test('the digest cron is scheduled in the morning and documented',()=>{
 const vercel=JSON.parse(fs.readFileSync('vercel.json','utf8'));
 assert.deepEqual(vercel.crons.find(cron=>cron.path==='/api/cron/telegram-digest'),{path:'/api/cron/telegram-digest',schedule:'0 4 * * *'});
 assert.match(fs.readFileSync('VERCEL.md','utf8'),/telegram-digest/);
});

function cronRoute({subscriptions,records={},occurrences={},languages={},names={},currencies={},snapshots={},reminders={},sendResult=true,failFor=''}){
 const sent=[],reads=[];
 const db={
  async read(path){
   reads.push(path);
   const owner=/user_id=eq\.([\w-]+)/.exec(path)?.[1];
   if(failFor&&owner===failFor)throw Error('Database request failed.');
   if(path.startsWith('/rest/v1/telegram_subscriptions'))return subscriptions;
   if(path.startsWith('/rest/v1/finance_records'))return records[owner]??[];
   if(path.startsWith('/rest/v1/payment_occurrences'))return occurrences[owner]??[];
   if(path.startsWith('/rest/v1/user_preferences'))return owner in languages||owner in names||owner in currencies?[{language:languages[owner],display_name:names[owner],currencies:currencies[owner]}]:[];
   if(path.startsWith('/rest/v1/portfolio_snapshots'))return [...(snapshots[owner]??[])].reverse();
   if(path.startsWith('/rest/v1/workspace_preferences'))return owner in reminders?[{data:reminders[owner]}]:[];
   throw Error('unexpected '+path);
  },
  async write(){throw Error('digest never writes');},
 };
 const route=loadTS('app/api/cron/telegram-digest/route.ts',{
  '@/lib/service-role':{serviceDatabase:()=>db},
  '@/lib/telegram':{telegramConfig:()=>({token:'T',webhookSecret:'S',botUsername:'b'}),sendTelegramMessage:async message=>{sent.push(message);return sendResult;},escapeHtml:text=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')},
  '@/lib/deposit-interest':{...loadTS('lib/deposit-interest.ts'),depositToday:()=>'2026-09-30'},
 });
 return {sent,reads,GET:()=>route.GET(new Request('https://local',{headers:{authorization:'Bearer test-secret'}}))};
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
