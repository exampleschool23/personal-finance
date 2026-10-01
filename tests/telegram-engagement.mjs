import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';
const {newGoalThresholds,netWorthHigh,milestoneMessage}=loadTS('lib/milestones.ts');
const {sendActionMilestone,announceNetWorthHigh}=loadTS('lib/telegram-milestones.ts');
const {periodTotals,topCategory,shiftDay}=loadTS('lib/period-summary.ts');
const {recapMessage,shareLink}=loadTS('lib/recap-message.ts');
const owner='11111111-1111-4111-8111-111111111111',goalId='22222222-2222-4222-8222-222222222222';
const config={token:'T',webhookSecret:'S',botUsername:'bot'};

// A small in-memory stand-in for the tables the celebrations touch.
function world(seed={}){
 const tables={telegram_subscriptions:[{user_id:owner,chat_id:500,actions_enabled:true,first_name:'Telegram Name'}],user_preferences:[{user_id:owner,language:'en',currencies:['USD'],display_name:'Aziz'}],savings_goals:[],finance_records:[],telegram_milestones:[],portfolio_snapshots:[],...structuredClone(seed)};
 const sent=[],name=path=>path.split('?')[0].replace('/rest/v1/','');
 const db={
  async read(path){
   const rows=tables[name(path)];if(!rows)throw Error('unexpected '+path);
   const params=new URLSearchParams(path.split('?')[1]);
   const [orderBy,direction]=(params.get('order')??'').split('.'),sign=direction==='desc'?-1:1;
   return structuredClone(rows.filter(row=>[...params].every(([key,value])=>{
    if(['select','order','limit','on_conflict'].includes(key))return true;
    if(value.startsWith('eq.'))return String(row[key])===value.slice(3);
    if(value.startsWith('like.'))return String(row[key]).startsWith(value.slice(5,-1));
    return true;
   })).sort((a,b)=>orderBy?sign*String(a[orderBy]).localeCompare(String(b[orderBy])):0));
  },
  async write(path,init){
   const rows=tables[name(path)],body=JSON.parse(init.body),list=Array.isArray(body)?body:[body],inserted=[];
   for(const item of list){
    const existing=rows.find(row=>row.user_id===item.user_id&&row.key===item.key);
    if(existing){if(init.headers.Prefer.includes('merge-duplicates'))Object.assign(existing,item);}
    else{rows.push({...item});inserted.push({...item});}
   }
   return Response.json(inserted,{status:201});
  },
 };
 return {tables,sent,db,send:async message=>{sent.push(message);return true;}};
}
const deps=w=>({db:w.db,config,send:w.send});
const created=(extra={})=>({type:'record',created:true,kind:'Other expense',name:'Coffee',amount:5,currency:'USD',date:'2026-10-01',frequency:'Once',...extra});
const contribution={type:'goal_activity',goal_id:goalId,activity:'contribution',amount:10,date:'2026-10-01'};
const goal=(allocated,extra={})=>({id:goalId,user_id:owner,name:'Emergency fund <1>',allocated,target:1000,kind:'savings',archived:false,...extra});
const auth={token:'owner-token',user:{id:owner}};

test('goal thresholds are the quarters reached and not yet celebrated',()=>{
 assert.deepEqual(newGoalThresholds(0,1000,[]),[]);
 assert.deepEqual(newGoalThresholds(250,1000,[]),[25]);
 assert.deepEqual(newGoalThresholds(800,1000,[]),[25,50,75]);
 assert.deepEqual(newGoalThresholds(800,1000,[25,50]),[75]);
 assert.deepEqual(newGoalThresholds(1000,1000,[25,50,75]),[100]);
 assert.deepEqual(newGoalThresholds(900,1000,[25,50,75,100]),[]);
 assert.deepEqual(newGoalThresholds(5,0,[]),[]);
});

test('a net-worth high needs a week of history and a 2% margin, and the first run only records a baseline',()=>{
 const week=[100,102,101,103,104,105,106];
 assert.deepEqual(netWorthHigh([...week],null),{notify:false,store:null});
 assert.deepEqual(netWorthHigh([...week,106.5],null),{notify:false,store:106});
 assert.deepEqual(netWorthHigh([...week,109],null),{notify:true,store:109});
 assert.deepEqual(netWorthHigh([...week,109],109),{notify:false,store:null});
 assert.deepEqual(netWorthHigh([...week,111.3],109),{notify:true,store:111.3});
 assert.deepEqual(netWorthHigh([...week,100],109),{notify:false,store:null});
 // Climbing out of debt into positive territory counts.
 assert.deepEqual(netWorthHigh([-50,-40,-30,-20,-10,-5,-2,5],null),{notify:true,store:5});
 assert.deepEqual(netWorthHigh([-50,-40,-30,-20,-10,-5,-2,-1],null),{notify:false,store:-2});
});

test('celebrations address the owner by name, drop the address without one, and escape names',()=>{
 assert.equal(milestoneMessage({type:'first_record'},'en','Aziz'),'Aziz, you saved your first record 🎉 Your money story starts here.');
 assert.equal(milestoneMessage({type:'first_record'},'en',''),'You saved your first record 🎉 Your money story starts here.');
 assert.equal(milestoneMessage({type:'goal',goal:'Emergency fund',percent:50},'en','Aziz'),'Aziz, your <b>Emergency fund</b> just passed 50% 🎉');
 assert.equal(milestoneMessage({type:'goal',goal:'Car <1>',percent:25},'en','  '),'Your <b>Car &lt;1&gt;</b> just passed 25% 🎉');
 assert.equal(milestoneMessage({type:'goal_complete',goal:'Trip'},'en','A & B'),'A &amp; B, you reached your <b>Trip</b> goal 🏆');
 assert.equal(milestoneMessage({type:'net_worth',amount:12500.4,currency:'USD'},'en','Aziz'),'Aziz, new net-worth high: $12,500 📈');
 assert.match(milestoneMessage({type:'goal',goal:'Цель',percent:75},'ru','Азиз'),/^Азиз, ваша цель «<b>Цель<\/b>» преодолела 75% 🎉$/);
});

test('the first record is celebrated once, by the name saved in the app',async()=>{
 const w=world({finance_records:[{id:'r1',user_id:owner}]});
 assert.equal(await sendActionMilestone(auth,created(),deps(w)),true);
 assert.equal(w.sent.length,1);assert.equal(w.sent[0].chat_id,500);
 assert.equal(w.sent[0].text,'Aziz, you saved your first record 🎉 Your money story starts here.');
 assert.deepEqual(w.tables.telegram_milestones.map(row=>row.key),['first_record']);
 w.tables.finance_records.push({id:'r2',user_id:owner});
 assert.equal(await sendActionMilestone(auth,created(),deps(w)),false);
 assert.equal(w.sent.length,1);
});

test('an owner who already had records is marked quietly, and edits never celebrate',async()=>{
 const veteran=world({finance_records:[{id:'a',user_id:owner},{id:'b',user_id:owner},{id:'c',user_id:owner}]});
 assert.equal(await sendActionMilestone(auth,created(),deps(veteran)),false);
 assert.equal(veteran.sent.length,0);assert.equal(veteran.tables.telegram_milestones.length,1);
 const edit=world({finance_records:[{id:'a',user_id:owner}]});
 assert.equal(await sendActionMilestone(auth,created({created:false}),deps(edit)),false);
 assert.equal(edit.tables.telegram_milestones.length,0);
});

test('no celebration without a linked chat, with action messages off, without a name saved, or without the server key',async()=>{
 const off=world({telegram_subscriptions:[{user_id:owner,chat_id:500,actions_enabled:false}],finance_records:[{id:'a',user_id:owner}]});
 assert.equal(await sendActionMilestone(auth,created(),deps(off)),false);assert.equal(off.tables.telegram_milestones.length,0);
 const unlinked=world({telegram_subscriptions:[{user_id:owner,chat_id:null,actions_enabled:true}],finance_records:[{id:'a',user_id:owner}]});
 assert.equal(await sendActionMilestone(auth,created(),deps(unlinked)),false);
 const unnamed=world({user_preferences:[{user_id:owner,language:'en',currencies:['USD'],display_name:''}],finance_records:[{id:'a',user_id:owner}]});
 await sendActionMilestone(auth,created(),deps(unnamed));
 assert.equal(unnamed.sent[0].text,'You saved your first record 🎉 Your money story starts here.');
 assert.equal(await sendActionMilestone(auth,created(),{db:null,config,send:off.send}),false);
 assert.equal(await sendActionMilestone({token:'t'},created(),deps(off)),false);
});

test('a savings goal is celebrated once per quarter, announcing the highest one reached',async()=>{
 const w=world({savings_goals:[goal(260)]});
 assert.equal(await sendActionMilestone(auth,contribution,deps(w)),true);
 assert.equal(w.sent.at(-1).text,'Aziz, your <b>Emergency fund &lt;1&gt;</b> just passed 25% 🎉');
 assert.equal(await sendActionMilestone(auth,contribution,deps(w)),false);
 w.tables.savings_goals[0].allocated=800;
 assert.equal(await sendActionMilestone(auth,contribution,deps(w)),true);
 assert.match(w.sent.at(-1).text,/just passed 75%/);
 assert.deepEqual(w.tables.telegram_milestones.map(row=>row.key).sort(),[25,50,75].map(n=>`goal:${goalId}:${n}`).sort());
 w.tables.savings_goals[0].allocated=1000;
 assert.equal(await sendActionMilestone(auth,contribution,deps(w)),true);
 assert.equal(w.sent.at(-1).text,'Aziz, you reached your <b>Emergency fund &lt;1&gt;</b> goal 🏆');
 assert.equal(await sendActionMilestone(auth,contribution,deps(w)),false);
 assert.equal(w.sent.length,3);
});

test('withdrawals, transfers, other goal types and archived goals are never celebrated',async()=>{
 const w=world({savings_goals:[goal(900)]});
 for(const activity of ['withdrawal','transfer'])assert.equal(await sendActionMilestone(auth,{...contribution,activity},deps(w)),false);
 for(const extra of [{kind:'net_worth'},{kind:'investment'},{archived:true}]){
  const other=world({savings_goals:[goal(900,extra)]});
  assert.equal(await sendActionMilestone(auth,contribution,deps(other)),false);assert.equal(other.tables.telegram_milestones.length,0);
 }
 assert.equal(await sendActionMilestone(auth,contribution,deps(world())),false);
 assert.equal(w.sent.length,0);assert.equal(w.tables.telegram_milestones.length,0);
});

const snapshots=nets=>nets.map((net,index)=>({user_id:owner,occurred_on:shiftDay('2026-09-20',index),assets:net,debt:0,rates:{USD:1},updated_at:'x'}));
const climb=[100,102,101,103,104,105,106];

test('a new net-worth high is announced after a week of history, then only after climbing another 2%',async()=>{
 const young=world({portfolio_snapshots:snapshots([100,110,120])});
 assert.equal(await announceNetWorthHigh(owner,deps(young)),false);assert.equal(young.tables.telegram_milestones.length,0);
 const w=world({portfolio_snapshots:snapshots([...climb,106.5])});
 assert.equal(await announceNetWorthHigh(owner,deps(w)),false);
 assert.equal(w.tables.telegram_milestones[0].value,106);
 w.tables.portfolio_snapshots=snapshots([...climb,109]);
 assert.equal(await announceNetWorthHigh(owner,deps(w)),true);
 assert.equal(w.sent.at(-1).text,'Aziz, new net-worth high: $109 📈');
 assert.equal(w.tables.telegram_milestones[0].value,109);
 w.tables.portfolio_snapshots=snapshots([...climb,109,110]);
 assert.equal(await announceNetWorthHigh(owner,deps(w)),false);
 w.tables.portfolio_snapshots=snapshots([...climb,109,115]);
 assert.equal(await announceNetWorthHigh(owner,deps(w)),true);
 assert.equal(w.sent.length,2);
});

test('net-worth highs respect the chat link and the action-message switch',async()=>{
 const off=world({telegram_subscriptions:[{user_id:owner,chat_id:500,actions_enabled:false}],portfolio_snapshots:snapshots([...climb,120])});
 assert.equal(await announceNetWorthHigh(owner,deps(off)),false);assert.equal(off.tables.telegram_milestones.length,0);
 assert.equal(await announceNetWorthHigh(owner,{db:null,config}),false);
});

const row=(kind,amount,date,extra={})=>({kind,amount,currency:'USD',date,frequency:'Once',custom_category_id:null,...extra});
test('period totals count only actual income and expenses inside the range, in the owner\'s currency',()=>{
 const records=[
  row('Salary',1000,'2026-09-30'),row('Living expense',200,'2026-09-30'),row('Charity',50,'2026-10-04'),
  row('Living expense',90,'2026-09-29'),row('Living expense',999,'2026-10-05'),
  row('Rent expense',500,'2026-10-01',{frequency:'Monthly'}),row('Cash',700,'2026-10-01'),
  row('Other expense',100000,'2026-10-02',{currency:'UZS'}),row('Other expense',7,'2026-10-02',{currency:'XYZ'}),
  row('Other expense',30,'2026-10-02',{custom_category_id:'c1'}),
 ];
 const totals=periodTotals(records,'2026-09-30','2026-10-04','USD',{UZS:12500});
 assert.equal(totals.income,1000);assert.equal(totals.spending,200+50+8+30);
 assert.deepEqual(totals.byCategory,{'k:Living expense':200,'k:Charity':50,'k:Other expense':8,'c:c1':30});
 assert.deepEqual(topCategory(totals.byCategory),{key:'k:Living expense',amount:200});
 assert.equal(topCategory({}),null);
 assert.equal(periodTotals(records,'2026-09-30','2026-09-30','UZS',{UZS:12500}).income,12500000);
 assert.equal(shiftDay('2026-03-01',-1),'2026-02-28');assert.equal(shiftDay('2026-12-31',1),'2027-01-01');
});

const recap=(extra={})=>({name:'Aziz',currency:'USD',from:'2026-09-28',to:'2026-10-04',income:1000,spending:420,top:{label:'Living expense',amount:200},goalsMoved:2,shareOrigin:'https://hoggish.app',...extra});
test('the recap states what was saved, the top category and the goals moved, with a share button that carries no amounts',()=>{
 const message=recapMessage(recap(),'en');
 assert.equal(message.text,['📊 <b>Your week, Aziz</b>','28 September 2026 – 4 October 2026','','💰 You saved $580 this week.','🏷 Top spending: Living expense · $200','🎯 Goals moved forward: 2'].join('\n'));
 const [button]=message.keyboard.inline[0];
 assert.equal(button.text,'Share my week');
 const url=new URL(button.url);
 assert.equal(url.origin+url.pathname,'https://t.me/share/url');assert.equal(url.searchParams.get('url'),'https://hoggish.app');
 assert.equal(url.searchParams.get('text'),'I check in on my money every week with Hoggish 💪');
 assert.ok(!/\d/.test(url.searchParams.get('text')));
 assert.equal(shareLink('https://a.b','x y&z'),'https://t.me/share/url?url=https%3A%2F%2Fa.b&text=x%20y%26z');
});

test('spending more than earning is stated plainly, and optional lines and the button drop out when empty',()=>{
 const over=recapMessage(recap({income:100,spending:400,top:null,goalsMoved:0,name:'',shareOrigin:null}),'en');
 assert.equal(over.text,['📊 <b>Your week</b>','28 September 2026 – 4 October 2026','','💰 You spent $300 more than you earned this week.'].join('\n'));
 assert.equal(over.keyboard,undefined);
 const quiet=recapMessage(recap({income:0,spending:0,goalsMoved:0,top:null}),'en');
 assert.match(quiet.text,/A quiet week\. Add this week's records to see your recap\.$/);assert.equal(quiet.keyboard,undefined);
 assert.match(recapMessage(recap({income:0,spending:0,top:null}),'en').text,/Goals moved forward: 2/);
 assert.match(recapMessage(recap({name:'<i>'}),'en').text,/Your week, &lt;i&gt;/);
 assert.match(recapMessage(recap(),'ru').text,/^📊 <b>Ваша неделя, Aziz<\/b>\n28 сентября 2026 – 4 октября 2026/);
});

function recapRoute({subscriptions,records={},categories={},events={},prefs={},snapshots={},sendResult=true}){
 const sent=[];
 const db={
  async read(path){
   const who=/user_id=eq\.([\w-]+)/.exec(path)?.[1];
   if(path.startsWith('/rest/v1/telegram_subscriptions'))return subscriptions;
   if(path.startsWith('/rest/v1/finance_records'))return records[who]??[];
   if(path.startsWith('/rest/v1/custom_categories'))return categories[who]??[];
   if(path.startsWith('/rest/v1/goal_events'))return events[who]??[];
   if(path.startsWith('/rest/v1/user_preferences'))return who in prefs?[prefs[who]]:[];
   if(path.startsWith('/rest/v1/portfolio_snapshots'))return snapshots[who]??[];
   throw Error('unexpected '+path);
  },
  async write(){throw Error('the recap never writes');},
 };
 const route=loadTS('app/api/cron/telegram-recap/route.ts',{
  '@/lib/service-role':{serviceDatabase:()=>db},
  '@/lib/telegram':{telegramConfig:()=>config,sendTelegramMessage:async message=>{sent.push(message);return sendResult;},escapeHtml:text=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')},
  '@/lib/deposit-interest':{depositToday:()=>'2026-10-04'},
  '@/lib/account-access':{accountOrigin:()=>'https://hoggish.app'},
 });
 return {sent,GET:()=>route.GET(new Request('https://local',{headers:{authorization:'Bearer test-secret'}}))};
}
test('the recap cron sends each linked owner their own week, in their language, with their category names',async()=>{
 process.env.CRON_SECRET='test-secret';
 const cron=recapRoute({
  subscriptions:[{user_id:'anna',chat_id:1},{user_id:'bob',chat_id:2}],
  prefs:{anna:{language:'ru',display_name:'Анна',currencies:['USD']},bob:{language:'en',display_name:'',currencies:['EUR']}},
  records:{anna:[row('Salary',900,'2026-10-01'),row('Living expense',100,'2026-10-02'),row('Other expense',250,'2026-10-03',{custom_category_id:'c1'})],bob:[]},
  categories:{anna:[{id:'c1',name:'Pets'}]},
  events:{anna:[{goal_id:'g1'},{goal_id:'g1'},{goal_id:'g2'}]},
 });
 const response=await cron.GET();
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{sent:2,failed:0});
 const [anna,bob]=cron.sent;
 assert.equal(anna.chat_id,1);assert.match(anna.text,/Ваша неделя, Анна/);assert.match(anna.text,/Pets/);assert.match(anna.text,/Целей продвинулось: 2/);
 assert.ok(anna.keyboard.inline[0][0].url.startsWith('https://t.me/share/url?url=https%3A%2F%2Fhoggish.app'));
 assert.match(bob.text,/^📊 <b>Your week<\/b>/);assert.match(bob.text,/A quiet week/);
});

test('the recap cron refuses a wrong secret, reports unreachable owners, and is scheduled for Sunday evening',async()=>{
 process.env.CRON_SECRET='test-secret';
 const route=loadTS('app/api/cron/telegram-recap/route.ts',{'@/lib/service-role':{serviceDatabase:()=>{throw Error('must not be called');}}});
 assert.equal((await route.GET(new Request('https://local'))).status,401);
 assert.equal((await route.GET(new Request('https://local',{headers:{authorization:'Bearer wrong'}}))).status,401);
 const failing=recapRoute({subscriptions:[{user_id:'anna',chat_id:1}],prefs:{anna:{language:'en',display_name:'A',currencies:['USD']}},sendResult:false});
 const response=await failing.GET();
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{sent:0,failed:1});
 const vercel=JSON.parse(fs.readFileSync('vercel.json','utf8'));
 assert.deepEqual(vercel.crons.find(cron=>cron.path==='/api/cron/telegram-recap'),{path:'/api/cron/telegram-recap',schedule:'0 15 * * 0'});
 assert.match(fs.readFileSync('VERCEL.md','utf8'),/telegram-recap/);
});

test('milestones are server-only: the table, its migration and the fresh-database script agree',()=>{
 const migration=fs.readFileSync('migrations/083_telegram_milestones.sql','utf8'),setup=fs.readFileSync('database/setup.sql','utf8');
 for(const sql of [migration,setup]){
  assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.telegram_milestones/);
  assert.match(sql,/PRIMARY KEY \(user_id, key\)/);
  assert.match(sql,/ALTER TABLE public\.telegram_milestones ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/REVOKE ALL ON public\.telegram_milestones FROM PUBLIC,anon,authenticated/);
  assert.match(sql,/GRANT SELECT,INSERT,UPDATE,DELETE ON public\.telegram_milestones TO service_role/);
  assert.doesNotMatch(sql,/GRANT[^;]*telegram_milestones TO authenticated/);
 }
});

test('the daily snapshot cron announces highs per captured owner and a failed announcement never fails the capture',async()=>{
 process.env.CRON_SECRET='test-secret';process.env.SUPABASE_URL='https://db.local';process.env.SUPABASE_SERVICE_ROLE_KEY='sb_secret_test';
 const announced=[],realFetch=globalThis.fetch;
 globalThis.fetch=async(url)=>String(url).includes('/rpc/')?Response.json({}):Response.json(String(url).includes('offset=0')?[{id:'1',user_id:'anna',kind:'Cash'},{id:'2',user_id:'bob',kind:'Cash'}]:[]);
 try{
  const route=loadTS('app/api/cron/portfolio-snapshots/route.ts',{
   '@/lib/server-market':{loadMarket:async()=>({quotes:{},rates:{USD:1}})},
   '@/lib/market':{instrumentFor:()=>null},
   '@/lib/portfolio-snapshots':{snapshotTotals:()=>({assets:1,debt:0,rates:{USD:1}})},
   '@/lib/deposit-interest':{depositToday:()=>'2026-10-04'},
   '@/lib/telegram-milestones':{announceNetWorthHigh:async id=>{announced.push(id);if(id==='anna')throw Error('Telegram is down');return true;}},
  });
  const response=await route.GET(new Request('https://local',{headers:{authorization:'Bearer test-secret'}}));
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{captured:2,skipped:0,celebrated:1});
  assert.deepEqual(announced,['anna','bob']);
 }finally{globalThis.fetch=realFetch;}
});
