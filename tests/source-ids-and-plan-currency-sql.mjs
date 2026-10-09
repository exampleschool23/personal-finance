import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const id=n=>`13400000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/134_source_ids_and_plan_currency.sql','utf8');
const skip=!process.env.PGLITE_MODULE;
const auth=`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`;
const open=async()=>{const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();await db.exec(auth);await db.exec(setup);await db.exec(migration);return db;};

test('migration 134 is in setup.sql',()=>{assert.ok(setup.includes(migration));});

test('a new income source cannot take over a record by its id; its own schedule still saves (migration 134)',{skip},async()=>{
 const db=await open();
 try{
  const as=user=>db.exec(`RESET ROLE;SET request.jwt.claim.sub='${user}';SET ROLE authenticated;`);
  const save=data=>db.query('SELECT save_income_source($1) AS data',[{kind:'Salary',currency:'USD',mode:'fixed',amount:1000,frequency:'Monthly',start_date:'2026-01-01',...data}]);
  const record=async n=>(await db.query('SELECT name,amount::float AS amount,frequency,date::text AS date FROM finance_records WHERE id=$1',[id(n)])).rows[0];
  await as(id(1));
  await db.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES($1,$2,'Bonus','Salary','USD',250,'2026-02-10','Once')",[id(10),id(1)]);
  await as(id(2));
  await db.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES($1,$2,'Theirs','Salary','USD',90,'2026-02-11','Once')",[id(11),id(2)]);
  await as(id(1));
  const bonus=await record(10);
  // A new source named by an existing one-time payment's id is refused, and the payment stays as it was.
  await assert.rejects(save({id:id(10),name:'Job'}),/Check the income source fields/);
  assert.deepEqual(await record(10),bonus);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM income_sources')).rows[0].n,0);
  // Another person's record id is refused too, and their record is untouched.
  await assert.rejects(save({id:id(11),name:'Job'}),/Check the income source fields/);
  await db.exec('RESET ROLE');
  assert.equal((await record(11)).name,'Theirs');
  await as(id(1));
  // A variable source has no schedule, so it may carry that id, but turning it fixed later is held to the same rule.
  await save({id:id(10),name:'Tips',mode:'variable',amount:null,frequency:null,start_date:null});
  await assert.rejects(save({id:id(10),name:'Tips'}),/Check the income source fields/);
  assert.deepEqual(await record(10),bonus);
  // Normal create and update: the schedule takes the source's id and follows its edits.
  await save({id:id(20),name:'Job'});
  assert.deepEqual(await record(20),{name:'Job',amount:1000,frequency:'Monthly',date:'2026-01-01'});
  await save({id:id(20),name:'Main job',amount:1200});
  assert.deepEqual(await record(20),{name:'Main job',amount:1200,frequency:'Monthly',date:'2026-01-01'});
  assert.deepEqual((await db.query('SELECT schedule_id FROM income_sources WHERE id=$1',[id(20)])).rows[0],{schedule_id:id(20)});
  // A variable source has no schedule; switching it to fixed creates one with its id.
  await save({id:id(21),name:'Gigs',mode:'variable',amount:null,frequency:null,start_date:null});
  await save({id:id(21),name:'Gigs',amount:300});
  assert.equal((await record(21)).amount,300);
 }finally{await db.close();}
});

test('a restored plan joins a same-named category only when its budget shares the plan currency (migration 134)',{skip},async()=>{
 const db=await open();
 try{
  const owner=id(1);
  const category=(n,name)=>db.query("INSERT INTO transaction_categories(id,user_id,name,direction) VALUES($1,$2,$3,'expense')",[id(n),owner,name]);
  const budget=(n,currency,amount)=>db.query("INSERT INTO budget_amounts(user_id,category_key,month,amount,currency,applies_forward) VALUES($1,$2,'2026-01-01',$3,$4,true)",[owner,id(n),amount,currency]);
  const plan=(n,name,currency)=>db.query("INSERT INTO expense_plans(id,user_id,name,category,currency,amount,start_date) VALUES($1,$2,$3,'Other',$4,300,'2026-01-01')",[id(n),owner,name,currency]);
  const budgets=async name=>(await db.query("SELECT a.amount::float AS amount,a.currency FROM budget_amounts a JOIN transaction_categories c ON c.id::text=a.category_key WHERE c.user_id=$1 AND c.name=$2 ORDER BY a.month",[owner,name])).rows;
  await category(30,'Food');await budget(30,'UZS',4000000);
  await category(31,'Fuel');await budget(31,'USD',100);
  await category(32,'Pets');
  // Food budgets in UZS: the USD plan gets its own category and keeps its budget.
  await plan(40,'Food','USD');
  assert.deepEqual(await budgets('Food'),[{amount:4000000,currency:'UZS'}]);
  assert.deepEqual(await budgets('Food (USD)'),[{amount:300,currency:'USD'}]);
  // A second USD plan named Food joins that category, its budget added.
  await plan(41,'food','USD');
  assert.deepEqual(await budgets('Food (USD)'),[{amount:600,currency:'USD'}]);
  // Same currency or no budget: the category is reused, ignoring letter case.
  await plan(42,'fuel','USD');assert.deepEqual(await budgets('Fuel'),[{amount:400,currency:'USD'}]);
  await plan(43,'Pets','EUR');assert.deepEqual(await budgets('Pets'),[{amount:300,currency:'EUR'}]);
  // A built-in name is never repeated.
  await plan(44,'Charity','USD');assert.deepEqual(await budgets('Charity (USD)'),[{amount:300,currency:'USD'}]);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM transaction_categories WHERE user_id=$1",[owner])).rows[0].n,5);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM expense_plans')).rows[0].n,0);
 }finally{await db.close();}
});
