import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';

const {detectSubscriptions,recurringSuggestions,subscriptionTotals,applySubscriptionDecisions,recurringPlanDraft,normalizeMerchant,nextCharge,subscriptionSchemas}=loadTS('lib/recurring-insights.ts');
let next=0;
const charge=(name,date,amount,extra={})=>({id:'r'+(++next),name,kind:'Living expense',currency:'USD',amount,quantity:1,cost:0,rate:0,date,frequency:'Once',notes:'',...extra});
const series=(name,dates,amounts,extra)=>dates.map((date,index)=>charge(name,date,Array.isArray(amounts)?amounts[index]:amounts,extra));
const find=(list,name)=>list.find(item=>item.record.name===name);

test('merchant names from card statements group together',()=>{
 for(const name of ['SQ *NETFLIX.COM #4411','Netflix','NETFLIX.COM 88341','netflix inc.','  Netflíx '])assert.equal(normalizeMerchant(name),'netflix',name);
 assert.notEqual(normalizeMerchant('Netflix'),normalizeMerchant('Spotify'));
 // A name that is only noise keeps its plain text rather than becoming empty.
 assert.equal(normalizeMerchant('#123'),'#123');
 const rows=[charge('SQ *NETFLIX.COM #1','2026-06-11',15.49),charge('Netflix','2026-07-11',15.49),charge('NETFLIX.COM 99812','2026-08-11',15.49)];
 const [item]=detectSubscriptions(rows,'2026-08-20');assert.equal(item.charges.length,3);assert.equal(item.record.name,'NETFLIX.COM 99812');
});

test('cadences are found with date tolerance, month ends and one missed charge',()=>{
 const today='2026-09-01';
 const monthly=series('Gym',['2026-04-03','2026-05-01','2026-06-04','2026-07-02','2026-08-05'],40);
 const weekly=series('Meal kit',['2026-07-07','2026-07-14','2026-07-22','2026-07-28','2026-08-04','2026-08-11','2026-08-18','2026-08-25'],60);
 const fortnightly=series('Cleaner',['2026-07-06','2026-07-20','2026-08-03','2026-08-17','2026-08-31'],80);
 const quarterly=series('Domain bundle',['2025-11-15','2026-02-14','2026-05-16','2026-08-15'],30);
 const yearly=series('Cloud backup',['2024-09-10','2025-09-08'],99,{currency:'EUR'});
 const found=detectSubscriptions([...monthly,...weekly,...fortnightly,...quarterly,...yearly],'2025-09-20');
 assert.equal(find(found,'Cloud backup').cadence,'Yearly');assert.equal(find(found,'Cloud backup').next,'2026-09-08');
 const all=detectSubscriptions([...monthly,...weekly,...fortnightly,...quarterly],today);
 assert.deepEqual(Object.fromEntries(all.map(item=>[item.record.name,item.cadence])),{Gym:'Monthly','Meal kit':'Weekly',Cleaner:'Fortnightly','Domain bundle':'Quarterly'});
 assert.equal(find(all,'Gym').next,'2026-09-05');assert.equal(find(all,'Meal kit').next,'2026-09-01');assert.equal(find(all,'Domain bundle').next,'2026-11-15');
 assert.equal(nextCharge('2026-01-31','Monthly'),'2026-02-28');assert.equal(nextCharge('2026-11-30','Quarterly'),'2027-02-28');assert.equal(nextCharge('2024-02-29','Yearly'),'2025-02-28');
 // Clamped month ends still read as monthly.
 assert.equal(detectSubscriptions(series('Rent box',['2026-01-31','2026-02-28','2026-03-31','2026-04-30'],25),'2026-05-02')[0].cadence,'Monthly');
 // One skipped month keeps the pattern, at a lower confidence.
 const gap=detectSubscriptions(series('Gym',['2026-03-03','2026-04-03','2026-06-03','2026-07-03','2026-08-03'],40),today)[0];
 assert.equal(gap.missedCharges,1);assert.equal(gap.charges.length,5);assert.notEqual(gap.confidence,'high');
 assert.equal(find(all,'Gym').confidence,'high');
 // Monthly cost follows the cadence; yearly is the cost of a year of charges.
 assert.equal(find(all,'Meal kit').yearly,60*365.25/7);assert.equal(find(all,'Domain bundle').monthly,10);assert.equal(find(all,'Gym').yearly,480);
});

test('price stability: drift is not a change, a step up is flagged, a variable bill is not a subscription',()=>{
 const today='2026-08-20';
 const drift=detectSubscriptions(series('Storage',['2026-04-10','2026-05-10','2026-06-10','2026-07-10','2026-08-10'],[10,10.05,10.1,10.12,10.15]),today)[0];
 assert.ok(drift);assert.deepEqual(drift.priceChanges,[]);assert.equal(drift.priceIncrease,null);
 const raised=detectSubscriptions(series('Music',['2026-04-06','2026-05-06','2026-06-06','2026-07-06','2026-08-06'],[11.99,11.99,11.99,12.99,12.99]),today)[0];
 assert.deepEqual(raised.priceIncrease,{date:'2026-07-06',from:11.99,to:12.99,percent:(12.99-11.99)/11.99*100});
 assert.equal(raised.amount,12.99,'costs use the current price');assert.equal(raised.typical,11.99,'typical is the median of the run');
 // A raise more than three charges ago is no longer news; a cut is a change but not an increase.
 const old=detectSubscriptions(series('Music',['2026-03-06','2026-04-06','2026-05-06','2026-06-06','2026-07-06','2026-08-06'],[9.99,11.99,11.99,11.99,11.99,11.99]),today)[0];
 assert.equal(old.priceChanges.length,1);assert.equal(old.priceIncrease,null);
 const cut=detectSubscriptions(series('Music',['2026-05-06','2026-06-06','2026-07-06','2026-08-06'],[12,12,12,10]),today)[0];
 assert.equal(cut.priceChanges[0].to,10);assert.equal(cut.priceIncrease,null);
 // Groceries on the same day each month with changing totals are a pattern, not a subscription.
 const groceries=series('Grocer',['2026-04-01','2026-05-01','2026-06-01','2026-07-01','2026-08-01'],[184,192,176,201,188]);
 assert.equal(detectSubscriptions(groceries,today).length,0);assert.equal(recurringSuggestions(groceries,today).length,1);
 assert.equal(detectSubscriptions(series('Odd',['2026-06-01','2026-07-01','2026-08-01'],[10,10,30]),today).length,0,'a tripled charge is not a price change');
});

test('false positives: irregular dates, too few charges, income, plans, future and protected rows',()=>{
 const today='2026-09-01';
 assert.equal(detectSubscriptions(series('Taxi',['2026-06-02','2026-06-19','2026-07-30','2026-08-04','2026-08-26'],20),today).length,0);
 assert.equal(detectSubscriptions(series('Gym',['2026-07-03','2026-08-03'],40),today).length,0,'two monthly charges are not enough');
 assert.equal(detectSubscriptions(series('Pay',['2026-06-01','2026-07-01','2026-08-01'],5000,{kind:'Salary'}),today).length,0,'income is never a subscription');
 const gym=series('Gym',['2026-06-03','2026-07-03','2026-08-03'],40);
 assert.equal(detectSubscriptions(gym,today).length,1);
 assert.equal(detectSubscriptions([...gym,{...gym[0],id:'plan',frequency:'Monthly',date:'2026-09-03'}],today).length,0,'already a recurring plan');
 assert.equal(detectSubscriptions([...gym,{...gym[0],id:'ended',frequency:'Monthly',end_date:'2026-05-01'}],today).length,1,'an ended plan does not hide it');
 assert.equal(detectSubscriptions(gym.map(row=>({...row,operation_id:'op'})),today).length,0);
 assert.equal(detectSubscriptions(series('Gym',['2026-08-03','2026-09-03','2026-10-03'],40),today).length,0,'future rows are not history');
 // A duplicate charge on the same day does not break the cadence.
 assert.equal(detectSubscriptions([...gym,{...gym[2],id:'dup'}],today)[0].charges.length,3);
});

test('currencies stay apart and totals are listed per currency, leaving out ones that look cancelled',()=>{
 const today='2026-08-20';
 const usd=series('Cloud',['2026-05-02','2026-06-02','2026-07-02','2026-08-02'],10);
 const eur=series('Cloud',['2026-05-02','2026-06-02','2026-07-02','2026-08-02'],9,{currency:'EUR'});
 const stopped=series('Paper',['2026-03-15','2026-04-15','2026-05-15','2026-06-15'],8);
 const live=detectSubscriptions([...usd,...eur,...stopped],today);
 assert.equal(live.filter(item=>item.merchant==='cloud').length,2);
 const paper=find(live,'Paper');assert.equal(paper.missed,true);assert.equal(paper.overdueDays,36);assert.equal(live.at(-1),paper,'missed ones sort last');
 assert.deepEqual(subscriptionTotals(live).map(total=>[total.currency,total.monthly,total.yearly,total.count]),[['EUR',9,108,1],['USD',10,120,1]]);
 // Within its grace days a late charge is not missed; more than two periods overdue is history.
 assert.equal(find(detectSubscriptions(stopped,'2026-07-20'),'Paper').missed,false);
 assert.equal(detectSubscriptions(stopped,'2026-09-30').length,0);
});

test('decisions hide a subscription; a cancelled one returns when charged again',()=>{
 const today='2026-08-20';
 const items=detectSubscriptions([...series('Gym',['2026-06-03','2026-07-03','2026-08-03'],40),...series('Box',['2026-06-05','2026-07-05','2026-08-05'],25)],today);
 const decided=applySubscriptionDecisions(items,[{merchant:'gym',currency:'USD',status:'dismissed',decided_on:'2026-01-01'},{merchant:'box',currency:'USD',status:'cancelled',decided_on:'2026-08-06'},{merchant:'gym',currency:'EUR',status:'dismissed',decided_on:'2026-01-01'}]);
 assert.deepEqual(decided.active,[]);assert.deepEqual(decided.hidden.map(entry=>[entry.item.merchant,entry.decision.status]).sort(),[['box','cancelled'],['gym','dismissed']]);
 const again=applySubscriptionDecisions(items,[{merchant:'box',currency:'USD',status:'cancelled',decided_on:'2026-08-04'}]);
 assert.deepEqual(again.active.map(item=>item.merchant).sort(),['box','gym']);
});

test('a recurring plan draft starts on the next charge and leaves the account to the person',()=>{
 const last=charge('Domain bundle','2026-08-15',30,{account_id:'acct',import_key:'stmt:1',custom_category_id:'cat',revision:4});
 const quarterly=recurringPlanDraft(last,'Quarterly','2026-11-15','new');
 assert.equal(quarterly.frequency,'Custom');assert.equal(quarterly.recurrence_days,91);assert.equal(quarterly.date,'2026-11-15');assert.equal(quarterly.id,'new');
 assert.equal(quarterly.account_id,null);assert.equal(quarterly.import_key,null);assert.equal(quarterly.revision,undefined);assert.equal(quarterly.custom_category_id,'cat');assert.equal(quarterly.amount,30);
 const monthly=recurringPlanDraft(last,'Monthly','2026-09-15','id2');assert.equal(monthly.frequency,'Monthly');assert.equal(monthly.recurrence_days,null);
 assert.equal(last.account_id,'acct','the charge itself is not changed');
});

test('the sample workspace shows a steady subscription, a price rise and one that stopped, and nothing else',()=>{
 const {demoRecords}=loadTS('lib/demo-finance.ts');
 for(const today of ['2026-10-03','2026-10-28','2027-03-31']){
  const found=detectSubscriptions(demoRecords(today),today);
  assert.deepEqual(found.map(item=>item.record.name),['Netflix','Spotify','Daily News digital'],today);
  assert.ok(found[0].priceIncrease);assert.equal(found[2].missed,true);
 }
});

test('the subscriptions panel shows whole amounts, per-currency totals and caution pills',async()=>{
 const React=(await import('react')).default;const {renderToStaticMarkup}=await import('react-dom/server');
 const {demoRecords}=loadTS('lib/demo-finance.ts');
 const {SubscriptionsPanel}=loadTS('components/planning/subscriptions-panel.tsx',{'@/components/language-provider':{useLanguage:()=>({locale:'en-US',t:(key,values={})=>key.replace(/\{(\w+)\}/g,(match,name)=>values[name]??match)})},'@/lib/deposit-interest':{depositToday:()=>'2026-10-03'}});
 const records=demoRecords('2026-10-03');
 const props={records:[...records,...records.filter(row=>row.name==='Spotify').map(row=>({...row,id:row.id+'-eur',currency:'EUR'}))],decisions:[{merchant:'spotify',currency:'EUR',status:'dismissed',decided_on:'2026-10-01'}],loading:false,error:'',onRetry(){},decide:async()=>{},restore:async()=>{},onTrack(){}};
 const html=renderToStaticMarkup(React.createElement(SubscriptionsPanel,props));
 assert.match(html,/\$30 a month · \$360 a year/);assert.doesNotMatch(html,/\.99/,'whole amounts only');assert.doesNotMatch(html,/€/,'a hidden subscription is not in the totals');
 assert.equal((html.match(/status-badge is-caution/g)??[]).length,2);assert.match(html,/Price went up/);assert.match(html,/Possibly cancelled/);assert.match(html,/Up from \$15/);
 assert.match(html,/Hidden subscriptions/);assert.doesNotMatch(html,/<p>Charges that repeat/,'the explanation sits behind the ⓘ');
 const empty=renderToStaticMarkup(React.createElement(SubscriptionsPanel,{...props,records:[]}));assert.match(empty,/No subscriptions found yet/);
});

const owner='97000000-0000-4000-8000-000000000001';
function api({auth=true,origin=true,rows=[],ok=true}={}){
 const calls=[];
 return {...loadTS('app/api/subscriptions/route.ts',{'@/lib/supabase':{session:async()=>auth?{user:{id:owner},token:'owner-token'}:null,sameOrigin:()=>origin,supa:async(path,init,token)=>{calls.push({path,init,token});return Response.json(rows,{status:ok?200:500});}}}),calls};
}
const post=(action,data)=>new Request('https://local/api/subscriptions',{method:'POST',body:JSON.stringify({action,data})});
const decision={merchant:'netflix',currency:'USD',status:'cancelled',decided_on:'2026-10-03'};

test('subscription decisions API: session owner, same origin and strict fields',async()=>{
 for(const [options,status] of [[{auth:false},401],[{origin:false},403]]){const route=api(options);assert.equal((await route.POST(post('decide',decision))).status,status);assert.equal(route.calls.length,0);}
 const route=api();assert.equal((await route.POST(post('decide',decision))).status,200);
 const body=JSON.parse(route.calls[0].init.body);assert.equal(body.user_id,owner);assert.equal(route.calls[0].token,'owner-token');assert.match(route.calls[0].path,/on_conflict=user_id,merchant,currency/);
 for(const [action,data] of [['decide',{...decision,user_id:'97000000-0000-4000-8000-000000000002'}],['decide',{...decision,currency:'usd'}],['decide',{...decision,status:'deleted'}],['decide',{...decision,decided_on:'2026-02-30'}],['decide',{...decision,merchant:' '}],['wipe',decision],['restore',{merchant:'netflix'}]]){
  const invalid=api();assert.equal((await invalid.POST(post(action,data))).status,400,JSON.stringify([action,data]));assert.equal(invalid.calls.length,0);
 }
 const restore=api();assert.equal((await restore.POST(post('restore',{merchant:'daily news',currency:'USD'}))).status,200);
 const url=new URL('https://x'+restore.calls[0].path);assert.equal(restore.calls[0].init.method,'DELETE');
 assert.equal(url.searchParams.get('user_id'),'eq.'+owner);assert.equal(url.searchParams.get('merchant'),'eq.daily news');assert.equal(url.searchParams.get('currency'),'eq.USD');
 assert.equal((await api({ok:false}).POST(post('decide',decision))).status,503);
 assert.equal(subscriptionSchemas.decide.safeParse(decision).success,true);
});

test('subscription decision reads are private to the request and fail closed',async()=>{
 const route=api({rows:[decision]});const response=await route.GET();
 assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual((await response.json()).decisions,[decision]);assert.equal(route.calls[0].token,'owner-token');
 assert.equal((await api({ok:false}).GET()).status,503);assert.equal((await api({auth:false}).GET()).status,401);
});

test('subscription decisions stay with their owner in the database',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 const id=n=>`97000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);
  const setup=fs.readFileSync('database/setup.sql','utf8'),migration=fs.readFileSync('migrations/097_subscriptions.sql','utf8');
  assert.ok(setup.includes(migration),'the fresh setup includes the migration');
  await db.exec(setup);
  await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${id(1)}';`);
  await db.exec(`INSERT INTO subscription_decisions(merchant,currency,status,decided_on) VALUES('netflix','USD','cancelled','2026-10-03')`);
  await db.exec(`INSERT INTO subscription_decisions(merchant,currency,status) VALUES('netflix','USD','dismissed') ON CONFLICT (user_id,merchant,currency) DO UPDATE SET status=excluded.status`);
  assert.equal((await db.query('SELECT status FROM subscription_decisions')).rows[0].status,'dismissed');
  await assert.rejects(db.exec(`INSERT INTO subscription_decisions(merchant,currency,status) VALUES('gym','usd','dismissed')`),/check/i);
  await assert.rejects(db.exec(`INSERT INTO subscription_decisions(merchant,currency,status) VALUES('gym','USD','paused')`),/check/i);
  await db.exec(`SET request.jwt.claim.sub='${id(2)}';`);
  assert.equal((await db.query('SELECT * FROM subscription_decisions')).rows.length,0,'another owner sees nothing');
  await assert.rejects(db.exec(`INSERT INTO subscription_decisions(user_id,merchant,currency,status) VALUES('${id(1)}','gym','USD','dismissed')`),/row-level security/i);
  assert.equal((await db.query(`DELETE FROM subscription_decisions WHERE merchant='netflix'`)).affectedRows,0);
  await db.exec(`SET request.jwt.claim.sub='${id(1)}';`);
  assert.equal((await db.query('SELECT * FROM subscription_decisions')).rows.length,1);
 }finally{await db.close();}
});
