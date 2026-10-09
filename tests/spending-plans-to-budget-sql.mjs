import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const id=n=>`13000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/131_spending_plans_to_budget.sql','utf8');
const skip=!process.env.PGLITE_MODULE;
const auth=`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`;
const setupBefore=setup.slice(0,setup.indexOf('-- Spending plans become Budget categories.'));

test('migration 131 is in setup.sql',()=>{assert.ok(setup.includes(migration));});

test('each spending plan becomes a Budget category with its amounts, pauses, end, carry-over and spending (migration 131)',{skip},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 try{
  await db.exec(auth);await db.exec(setupBefore);
  const plan=(n,owner,name,category,currency,amount,start,end=null)=>db.query('INSERT INTO expense_plans(id,user_id,name,category,currency,amount,start_date,end_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id(n),owner,name,category,currency,amount,start,end]);
  const version=(n,owner,month,amount,rollover)=>db.query('INSERT INTO expense_plan_versions VALUES($1,$2,$3,$4,$5) ON CONFLICT(plan_id,effective_month) DO UPDATE SET amount=excluded.amount,rollover=excluded.rollover',[id(n),owner,month,amount,rollover]);
  const spend=(n,owner,planId,date,amount,category=null)=>db.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,expense_plan_id,custom_category_id) VALUES($1,$2,'Shop','Living expense','USD',$3,$4,'Once',$5,$6)",[id(n),owner,amount,date,planId,category]);
  // Groceries: 300 from January, 350 from March with carry-over, archived in May and restored in July, ending in August.
  await plan(10,id(1),'Groceries','Groceries','USD',300,'2026-01-05','2026-08-20');
  await version(10,id(1),'2026-03-01',350,true);
  await db.query(`UPDATE expense_plans SET archive_pauses='[{"from":"2026-05-10","to":"2026-07-02"}]' WHERE id=$1`,[id(10)]);
  await db.query("INSERT INTO transaction_categories(id,user_id,name,direction) VALUES($1,$2,'Coffee','expense')",[id(30),id(1)]);
  await spend(20,id(1),id(10),'2026-01-10',40);
  await spend(21,id(1),id(10),'2026-03-12',55.5,id(30));
  // A second plan with the same name joins the category; another named after an existing category reuses it.
  await plan(11,id(1),'Groceries','Household','USD',100,'2026-04-01');
  await plan(12,id(1),'Coffee','Other','USD',25,'2026-02-01');
  await spend(22,id(1),id(12),'2026-02-03',4);
  // A deleted transaction of a plan follows it.
  await db.query("INSERT INTO deleted_items(id,user_id,source,data) VALUES($1,$2,'finance_records',$3)",[id(40),id(1),{id:id(41),name:'Old',kind:'Living expense',currency:'USD',amount:9,date:'2026-01-20',frequency:'Once',expense_plan_id:id(10)}]);
  // Another owner's plan.
  await plan(13,id(2),'Groceries','Groceries','USD',500,'2026-01-01');
  await db.exec(migration);

  assert.equal(Number((await db.query('SELECT count(*) AS n FROM expense_plans')).rows[0].n),0);
  const cat=async(owner,name)=>(await db.query("SELECT id FROM transaction_categories WHERE user_id=$1 AND direction='expense' AND name=$2",[owner,name])).rows.map(row=>row.id);
  const [groceries]=await cat(id(1),'Groceries');
  assert.ok(groceries);assert.deepEqual(await cat(id(1),'Coffee'),[id(30)]);
  const rows=async(owner,key)=>(await db.query("SELECT to_char(month,'YYYY-MM') AS month,amount::float AS amount,currency,applies_forward AS forward FROM budget_amounts WHERE user_id=$1 AND category_key=$2 ORDER BY month",[owner,key])).rows.map(row=>[row.month,row.amount,row.currency,row.forward]);
  assert.deepEqual(await rows(id(1),groceries),[
   ['2026-01',300,'USD',true],['2026-03',350,'USD',true],['2026-04',450,'USD',true],
   ['2026-05',100,'USD',true],['2026-07',450,'USD',true],['2026-09',100,'USD',true]]);
  assert.deepEqual(await rows(id(1),id(30)),[['2026-02',25,'USD',true]]);
  const setting=(await db.query('SELECT group_name,rollover,to_char(rollover_start,$2) AS start,rollover_negative FROM budget_categories WHERE category_key=$1',[groceries,'YYYY-MM'])).rows[0];
  // The first plan's settings move over; the second only adds its amounts.
  assert.deepEqual(setting,{group_name:'Groceries',rollover:false,start:null,rollover_negative:false});
  const records=(await db.query('SELECT id,custom_category_id,expense_plan_id,kind,amount::float AS amount FROM finance_records ORDER BY id')).rows;
  assert.deepEqual(records.map(row=>[row.id,row.custom_category_id,row.expense_plan_id,row.kind,row.amount]),[
   [id(20),groceries,null,'Living expense',40],[id(21),groceries,null,'Living expense',55.5],[id(22),id(30),null,'Living expense',4]]);
  const bin=(await db.query('SELECT data FROM deleted_items WHERE id=$1',[id(40)])).rows[0].data;
  assert.equal(bin.custom_category_id,groceries);assert.equal(bin.expense_plan_id,null);
  const [theirs]=await cat(id(2),'Groceries');
  assert.ok(theirs&&theirs!==groceries);assert.deepEqual(await rows(id(2),theirs),[['2026-01',500,'USD',true]]);

  // A plan that comes back (an old backup, Recently deleted) converts when its transaction commits.
  await db.exec('BEGIN');
  await plan(14,id(1),'Pets','Other','USD',60,'2026-06-01');
  await spend(23,id(1),id(14),'2026-06-02',12);
  await db.exec('COMMIT');
  const [pets]=await cat(id(1),'Pets');
  assert.deepEqual(await rows(id(1),pets),[['2026-06',60,'USD',true]]);
  assert.equal((await db.query('SELECT custom_category_id FROM finance_records WHERE id=$1',[id(23)])).rows[0].custom_category_id,pets);

  // A plan still carrying over keeps carrying; signed-in people cannot add plans any more.
  await db.exec('BEGIN');await plan(15,id(1),'Gifts','Other','USD',50,'2026-01-01');await version(15,id(1),'2026-01-01',50,false);await version(15,id(1),'2026-04-01',50,true);await db.exec('COMMIT');
  const [gifts]=await cat(id(1),'Gifts');
  assert.deepEqual((await db.query('SELECT rollover,to_char(rollover_start,$2) AS start FROM budget_categories WHERE category_key=$1',[gifts,'YYYY-MM'])).rows[0],{rollover:true,start:'2026-04'});
  await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${id(1)}';`);
  await assert.rejects(plan(16,id(1),'New','Other','USD',10,'2026-01-01'),/permission denied/);
 }finally{await db.close();}
});
