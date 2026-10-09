import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';
const id=n=>`12700000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [owner,stranger]=[1,2].map(id);
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/128_review_integrity.sql','utf8');
const skip=!process.env.PGLITE_MODULE;
async function database(){
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}'),('${stranger}');`);
 await db.exec(setup);
 return db;
}
const as=(db,user)=>db.exec(`RESET ROLE;SET request.jwt.claim.sub='${user}';SET request.headers='{}';SET ROLE authenticated;`);

test('migration 128 is in setup.sql and reports schema version 128',async()=>{
 assert.ok(setup.includes(migration),'setup.sql includes migration 128');
 assert.match(migration,/'schema_version',128,/);
});

test('saving a goal\'s plan keeps a contribution recorded meanwhile in another tab',{skip},async()=>{
 const db=await database();
 try{
  await as(db,owner);
  await db.query(`SELECT public.save_finance_record('{"id":"${id(10)}","name":"Wallet","kind":"Cash","currency":"USD","amount":1000,"date":"2026-10-01"}'::jsonb)`);
  const goal=patch=>({id:id(20),name:'Laptop',kind:'savings',account_id:id(10),currency:'USD',target:500,allocated:100,target_date:'2030-01-01',archived:false,...patch});
  const allocated=async()=>Number((await db.query('SELECT allocated FROM savings_goals WHERE id=$1',[id(20)])).rows[0].allocated);
  const events=async()=>(await db.query('SELECT event_type,delta::float8 AS delta FROM goal_events WHERE goal_id=$1 ORDER BY created_at',[id(20)])).rows.map(row=>[row.event_type,row.delta]);
  await db.query("SELECT planning_action('goal',$1)",[goal()]);
  for(const [n,fn] of [[30,'planning_action'],[31,'planning_action_with_actual_amount']]){
   const before=await allocated();
   // The other tab adds 50.
   await db.query('SELECT record_goal_activity($1)',[{id:id(n),goal_id:id(20),target_id:null,source_id:null,amount:50,date:'2026-10-02',type:'contribution',notes:''}]);
   // This page loaded the old amount and saves only its plan: the contribution stays and no adjustment is written.
   await db.query(`SELECT ${fn}('goal',$1)`,[goal({allocated:before,expected_allocated:before,monthly_contribution:25})]);
   assert.equal(await allocated(),before+50,fn);
   assert.equal((await db.query('SELECT monthly_contribution::float8 AS m FROM savings_goals WHERE id=$1',[id(20)])).rows[0].m,25);
   // Changing the amount on purpose from the stale copy is refused, and from the current one it is saved.
   await assert.rejects(db.query(`SELECT ${fn}('goal',$1)`,[goal({allocated:120,expected_allocated:before})]),/changed since you opened it/);
   assert.equal(await allocated(),before+50);
  }
  assert.deepEqual(await events(),[['opening',100],['contribution',50],['contribution',50]]);
  await db.query("SELECT planning_action('goal',$1)",[goal({allocated:120,expected_allocated:200})]);
  assert.equal(await allocated(),120);
  // A save without the loaded amount behaves as before.
  await db.query("SELECT planning_action('goal',$1)",[goal({allocated:130})]);
  assert.equal(await allocated(),130);
  // A new goal has nothing stored yet, so its expected amount is ignored.
  await db.query("SELECT planning_action('goal',$1)",[goal({id:id(21),allocated:40,expected_allocated:0})]);
  assert.equal(Number((await db.query('SELECT allocated FROM savings_goals WHERE id=$1',[id(21)])).rows[0].allocated),40);
 }finally{await db.close();}
});

test('the records summary stays small however many one-time transactions there are',{skip},async()=>{
 const db=await database();
 try{
  await as(db,owner);
  await db.query(`SELECT public.save_finance_record('{"id":"${id(10)}","name":"Wallet","kind":"Cash","currency":"USD","amount":100000,"date":"2026-10-01"}'::jsonb)`);
  await db.query(`SELECT public.save_finance_record('{"id":"${id(11)}","name":"Euro wallet","kind":"Cash","currency":"EUR","amount":100000,"date":"2026-10-01"}'::jsonb)`);
  await db.query(`INSERT INTO finance_records(id,user_id,name,kind,currency,amount,quantity,cost,date) VALUES('${id(12)}','${owner}','BTC','Crypto','USD',60000,0.5,30000,'2026-10-01')`);
  await db.query(`INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES('${id(13)}','${owner}','Salary','Salary','USD',3000,'2026-01-25','Monthly'),('${id(14)}','${owner}','Rent','Rent expense','USD',800,'2026-01-01','Monthly')`);
  await db.query(`INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,account_id)
   SELECT gen_random_uuid(),'${owner}','Shop '||n,CASE WHEN n%3=0 THEN 'Other income' ELSE 'Living expense' END,CASE WHEN n%2=0 THEN 'USD' ELSE 'EUR' END,10,'2026-10-01','Once',CASE WHEN n%2=0 THEN '${id(10)}'::uuid ELSE '${id(11)}'::uuid END FROM generate_series(1,600) n`);
  const page=(await db.query("SELECT finance_records_page(1,'all',NULL,true) AS page")).rows[0].page;
  assert.equal(page.total,605,'the table still counts every record');
  const summary=page.summary;
  assert.ok(summary.length<=10,`${summary.length} summary rows`);
  const find=(kind,currency)=>summary.filter(row=>row.kind===kind&&row.currency===currency);
  // Holdings and schedules are listed as before.
  assert.deepEqual(find('Cash','USD').map(row=>[row.name,Number(row.amount)]),[['Wallet',100000-2000+1000]]);
  assert.deepEqual(find('Crypto','USD').map(row=>[row.name,Number(row.quantity)]),[['BTC',0.5]]);
  assert.deepEqual(find('Salary','USD').map(row=>[row.name,row.frequency,row.date]),[['Salary','Monthly','2026-01-25']]);
  assert.deepEqual(find('Rent expense','USD').map(row=>row.name),['Rent']);
  // One-time income and spending: one row per kind and currency, with its total and count.
  const spent=find('Living expense','EUR');
  assert.deepEqual(spent.map(row=>[row.name,Number(row.amount),Number(row.record_count),row.business_id]),[['Living expense',2000,200,null]]);
  assert.equal(Number(find('Other income','USD')[0].record_count),100);
  // Another owner sees none of it.
  await as(db,stranger);
  assert.deepEqual((await db.query("SELECT finance_records_page(1,'all',NULL,true) AS page")).rows[0].page.summary,[]);
 }finally{await db.close();}
});

test('a month\'s budget amounts save together or not at all',{skip},async()=>{
 const db=await database();
 try{
  await as(db,owner);
  const rows=async()=>(await db.query("SELECT category_key,month::text,amount::float8 AS amount,applies_forward FROM budget_amounts ORDER BY category_key,month")).rows.map(r=>[r.category_key,r.month,r.amount,r.applies_forward]);
  const save=(items,currency='USD',month='2026-10-01')=>db.query('SELECT set_budget_amounts($1,$2,$3)',[month,currency,JSON.stringify(items)]);
  await db.query("SELECT set_budget_amount('Groceries','2026-12-01',90,'USD',false)");
  await save([{category_key:'Groceries',amount:400,applies_forward:true},{category_key:'Dining',amount:150.5,applies_forward:true},{category_key:'Fuel',amount:60,applies_forward:false}]);
  // Each item follows set_budget_amount: all future months replaces the later amount.
  assert.deepEqual(await rows(),[['Dining','2026-10-01',150.5,true],['Fuel','2026-10-01',60,false],['Groceries','2026-10-01',400,true]]);
  for(const bad of [[],[{category_key:'Rent',amount:1e16,applies_forward:true}],[{category_key:'Rent',amount:'NaN',applies_forward:true}],[{category_key:'Rent',amount:-1,applies_forward:true}],
   [{category_key:'',amount:1,applies_forward:true}],[{category_key:'Rent',amount:1}],[{category_key:'Rent',amount:1,applies_forward:true},{category_key:'Rent',amount:2,applies_forward:true}],
   [{category_key:'Rent',amount:500,applies_forward:true},{category_key:'Groceries',amount:1,applies_forward:true,extra:1},{category_key:'x'.repeat(81),amount:1,applies_forward:true}]])
   await assert.rejects(save(bad),/Check the budget fields/,JSON.stringify(bad).slice(0,60));
  await assert.rejects(save([{category_key:'Rent',amount:1,applies_forward:true}],'usd'),/Check the budget fields/);
  await assert.rejects(save([{category_key:'Rent',amount:1,applies_forward:true}],'USD','2026-10-15'),/whole months/);
  assert.equal((await rows()).length,3,'a refused batch changes nothing');
  // Another owner writes only to their own budget.
  await as(db,stranger);
  await save([{category_key:'Groceries',amount:1,applies_forward:true}]);
  assert.equal((await rows()).length,1);
  await as(db,owner);
  assert.equal((await rows()).find(row=>row[0]==='Groceries')[2],400);
  await db.exec('RESET ROLE;SET ROLE anon;');
  await assert.rejects(save([{category_key:'Rent',amount:1,applies_forward:true}]),/permission denied/);
 }finally{await db.close();}
});

test('the budget API saves Recalculate\'s amounts in one request',async()=>{
 const calls=[];
 const api=loadTS('app/api/budget/route.ts',{'@/lib/supabase':{session:async()=>({token:'owner-token',user:{id:'owner'}}),sameOrigin:()=>true,supa:async(path,init)=>{calls.push([path,JSON.parse(init.body)]);return Response.json(null);}}});
 const post=data=>api.POST(new Request('https://app.local/api/budget',{method:'POST',body:JSON.stringify({action:'amounts',data})}));
 const items=[{category_key:'Groceries',amount:400,applies_forward:true},{category_key:'Dining',amount:150,applies_forward:true}];
 assert.equal((await post({month:'2026-10',currency:'USD',items})).status,200);
 assert.deepEqual(calls,[['/rest/v1/rpc/set_budget_amounts',{p_month:'2026-10-01',p_currency:'USD',p_items:items}]]);
 for(const bad of [{month:'2026-10',currency:'USD',items:[]},{month:'2026-10',currency:'USD',items:[items[0],items[0]]},{month:'2026-13',currency:'USD',items},{month:'2026-10',currency:'USD',items:[{...items[0],amount:1e16}]}])
  assert.equal((await post(bad)).status,400);
 assert.equal(calls.length,1);
});

test('a goal save carries the allocation the form loaded through the API schema',()=>{
 const {planningSchemas}=loadTS('lib/planning-schemas.ts');
 const parsed=planningSchemas.goal.parse({id:id(20),name:'Laptop',kind:'savings',account_id:id(10),currency:'USD',target:500,allocated:100,expected_allocated:100,target_date:null});
 assert.equal(parsed.expected_allocated,100);
 assert.equal(planningSchemas.goal.safeParse({id:id(20),name:'Laptop',kind:'savings',account_id:id(10),currency:'USD',target:500,allocated:100,expected_allocated:-1,target_date:null}).success,false);
});
