import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`e1000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/138_delete_category_into_built_in.sql','utf8');
async function db(sql=setup){const d=new PGlite();await d.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);await d.exec(sql);await d.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${id(1)}';`);return d;}
const into=(d,from,kind)=>d.query('SELECT delete_category_into_kind($1,$2) AS data',[from,kind]);
const record=async(d,n)=>(await d.query('SELECT kind,custom_category_id,amount::text FROM finance_records WHERE id=$1',[id(n)])).rows[0];
// "Mum" is an added spending category with a payment, a monthly bill, a rule, a watchlist and a budget.
async function workspace(d){
 await d.query("SELECT planning_action('category',$1)",[{id:id(10),name:'Mum',direction:'expense'}]);
 await d.query("SELECT planning_action('category',$1)",[{id:id(11),name:'Freelance',direction:'income'}]);
 await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES($1,$2,'Cash','Cash','USD',1000,'2026-09-01','Once')",[id(20),id(1)]);
 await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,account_id,custom_category_id) VALUES($1,$2,'Mum','Other expense','USD',300.5,'2026-09-02','Once',$3,$4)",[id(21),id(1),id(20),id(10)]);
 await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,custom_category_id) VALUES($1,$2,'Mum','Other expense','USD',300,'2026-09-02','Monthly',$3)",[id(22),id(1),id(10)]);
 await d.query("INSERT INTO workspace_preferences(user_id,key,data) VALUES($1,'watchlists',$2)",[id(1),{items:[{id:id(40),name:'Watch',query:'',category:id(10),currency:'USD',target:30}]}]);
 await d.query('SELECT set_budget_amount($1,$2,$3,$4,$5)',[id(10),'2026-09-01',300,'USD',true]);
 await d.query('SELECT set_budget_amount($1,$2,$3,$4,$5)',['Charity','2026-09-01',50,'USD',true]);
}

test('migration 138 is in setup.sql and safe to re-run',async()=>{
 assert.ok(setup.includes(migration));
 const d=await db(setup.slice(0,setup.indexOf(migration)));
 try{await d.exec('RESET ROLE');await d.exec(migration);await d.exec(migration);}finally{await d.close();}
});

test('an added category’s records, watchlists and budget move into a built-in one, and it is deleted',async()=>{
 const d=await db();
 try{
  await workspace(d);
  const balance=async()=>(await d.query('SELECT amount::text FROM finance_records WHERE id=$1',[id(20)])).rows[0].amount;
  const before=await balance();
  await into(d,id(10),'Charity');
  assert.deepEqual(await record(d,21),{kind:'Charity',custom_category_id:null,amount:'300.5'},'the amount stays');
  assert.deepEqual(await record(d,22),{kind:'Charity',custom_category_id:null,amount:'300'},'a bill moves too');
  assert.equal(await balance(),before,'account balances stay');
  assert.equal((await d.query('SELECT count(*)::int AS n FROM transaction_categories WHERE id=$1',[id(10)])).rows[0].n,0);
  assert.equal((await d.query("SELECT data FROM workspace_preferences WHERE key='watchlists'")).rows[0].data.items[0].category,'Charity');
  assert.deepEqual((await d.query("SELECT category_key,amount::text FROM budget_amounts ORDER BY category_key")).rows,[{category_key:'Charity',amount:'350'}],'budgets add up');
 }finally{await d.close();}
});

test('a built-in category moves into another built-in one and is removed for the workspace',async()=>{
 const d=await db();
 try{
  await workspace(d);
  await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES($1,$2,'Gift','Charity','USD',20,'2026-09-03','Once')",[id(23),id(1)]);
  await into(d,'Charity','Living expense');
  assert.equal((await record(d,23)).kind,'Living expense');
  assert.equal((await record(d,21)).kind,'Other expense','an added category’s records stay where they are');
  assert.deepEqual((await d.query("SELECT data FROM workspace_preferences WHERE key='removed_categories'")).rows[0].data.kinds,['Charity']);
  await assert.rejects(into(d,id(10),'Charity'),/different category of the same type/,'a deleted built-in takes nothing');
 }finally{await d.close();}
});

test('the wrong type, splits, other owners and viewers are refused and nothing changes',async()=>{
 const d=await db();
 try{
  await workspace(d);
  await assert.rejects(into(d,id(10),'Salary'),/same type/);
  await assert.rejects(into(d,id(10),'Groceries'),/same type/);
  await d.exec('RESET ROLE');await d.query('INSERT INTO transaction_splits(record_id,user_id,position,category_id,amount) VALUES($1,$2,0,$3,100)',[id(21),id(1),id(10)]);await d.exec('SET ROLE authenticated');
  await assert.rejects(into(d,id(10),'Charity'),/Split allocations can only move to an added category/);
  assert.equal((await record(d,21)).kind,'Other expense');
  await d.exec(`SET request.jwt.claim.sub='${id(2)}';`);
  await assert.rejects(into(d,id(10),'Charity'),/not found/);
  // A view-only household member opens the owner's workspace and may not move anything.
  await d.exec(`SET request.jwt.claim.sub='${id(1)}';`);
  const invite=(await d.query("SELECT create_household_invite('viewer') AS r")).rows[0].r;
  await d.exec(`SET request.jwt.claim.sub='${id(2)}';`);
  await d.query('SELECT accept_household_invite($1)',[invite.token]);
  await d.exec(`SET request.headers='${JSON.stringify({'x-workspace-owner':id(1)})}';`);
  assert.equal((await d.query('SELECT count(*)::int AS n FROM finance_records WHERE id=$1',[id(21)])).rows[0].n,1,'the viewer reads the workspace');
  await assert.rejects(into(d,id(10),'Charity'),error=>error.code==='42501'&&/view-only/.test(error.message));
  await d.exec("SET request.headers='{}'");await d.exec(`SET request.jwt.claim.sub='${id(1)}';`);
  assert.deepEqual(await record(d,21),{kind:'Other expense',custom_category_id:id(10),amount:'300.5'});
  assert.equal((await d.query('SELECT count(*)::int AS n FROM transaction_categories WHERE id=$1',[id(10)])).rows[0].n,1);
 }finally{await d.close();}
});

test('a category whose bill would meet another active bill is refused with the reason, and nothing changes',async()=>{
 const d=await db();
 try{
  await workspace(d);
  await d.query("SELECT planning_action('category',$1)",[{id:id(12),name:'Dad',direction:'expense'}]);
  await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,custom_category_id) VALUES($1,$2,'Dad','Other expense','USD',100,'2026-09-10','Monthly',$3)",[id(24),id(1),id(12)]);
  const unchanged=async()=>{
   assert.deepEqual(await record(d,21),{kind:'Other expense',custom_category_id:id(10),amount:'300.5'});
   assert.deepEqual(await record(d,22),{kind:'Other expense',custom_category_id:id(10),amount:'300'});
   assert.equal((await d.query('SELECT count(*)::int AS n FROM transaction_categories WHERE id=$1',[id(10)])).rows[0].n,1,'Mum stays');
  };
  const reason=/Both categories have a recurring bill\. Archive one of them first\./;
  await assert.rejects(d.query('SELECT delete_transaction_category($1,$2)',[id(10),id(12)]),reason);
  await unchanged();
  await assert.rejects(d.query('UPDATE finance_records SET custom_category_id=$1 WHERE id=$2',[id(12),id(22)]),reason,'editing the bill into the category says the same');
  await unchanged();
  await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES($1,$2,'Gift','Charity','USD',20,'2026-09-03','Monthly')",[id(25),id(1)]);
  await assert.rejects(d.query('SELECT delete_built_in_category($1,$2)',['Charity',id(12)]),reason);
  assert.deepEqual(await record(d,25),{kind:'Charity',custom_category_id:null,amount:'20'});
  assert.equal((await d.query("SELECT count(*)::int AS n FROM workspace_preferences WHERE key='removed_categories'")).rows[0].n,0,'Charity is not removed');
  // With one bill archived the move goes through, and the moved bill keeps its history.
  await d.query('UPDATE finance_records SET archived=true WHERE id=$1',[id(24)]);
  await d.query('SELECT delete_transaction_category($1,$2)',[id(10),id(12)]);
  assert.deepEqual(await record(d,22),{kind:'Other expense',custom_category_id:id(12),amount:'300'});
  assert.deepEqual((await d.query('SELECT occurrence_record_id,custom_category_id FROM finance_records WHERE id=$1',[id(21)])).rows[0],{occurrence_record_id:id(22),custom_category_id:id(12)});
  assert.equal((await d.query('SELECT count(*)::int AS n FROM payment_occurrences WHERE record_id=$1',[id(22)])).rows[0].n,1);
 }finally{await d.close();}
});

test('outside a category move a bill with paid months still keeps its kind',async()=>{
 const d=await db();
 try{
  await workspace(d);
  assert.equal((await d.query('SELECT count(*)::int AS n FROM payment_occurrences WHERE record_id=$1',[id(22)])).rows[0].n,1,'the payment settled the bill (migration 137)');
  await assert.rejects(d.query("UPDATE finance_records SET kind='Charity' WHERE id=$1",[id(22)]),/Keep the schedule compatible/);
 }finally{await d.close();}
});
