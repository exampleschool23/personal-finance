import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const id=n=>`f0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('deleting a category moves its budget to the replacement month by month, and removes it without one (migration 127)',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);
  await db.exec(fs.readFileSync('database/setup.sql','utf8'));
  await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${id(1)}';`);
  for(const [n,name] of [[11,'Food'],[12,'Coffee'],[13,'Tea'],[14,'Snacks']])await db.query("SELECT planning_action('category',$1)",[{id:id(n),name,direction:'expense'}]);
  const amount=(owner,key,month,value,currency,forward)=>db.query('INSERT INTO budget_amounts(user_id,category_key,month,amount,currency,applies_forward) VALUES($1,$2,$3,$4,$5,$6)',[owner,key,month,value,currency,forward]);
  const setting=(owner,key,fields)=>db.query('INSERT INTO budget_categories(user_id,category_key,budget_type,rollover,rollover_start,rollover_balance,rollover_currency) VALUES($1,$2,$3,$4,$5,$6,$7)',[owner,key,fields.type??'flexible',!!fields.balance,fields.balance?'2026-01-01':null,fields.balance??0,fields.balance?'USD':null]);
  await db.exec('RESET ROLE');
  await amount(id(1),id(12),'2026-01-01',100,'USD',true);
  await amount(id(1),id(12),'2026-02-01',50,'USD',false);
  await amount(id(1),id(11),'2026-03-01',400,'USD',true);
  await amount(id(1),id(13),'2026-01-01',1000,'UZS',true);
  await amount(id(1),id(14),'2026-02-01',20,'USD',false);
  await amount(id(1),'Charity','2026-01-01',10,'USD',true);
  await amount(id(1),'Rent expense','2026-01-01',500,'USD',true);
  await amount(id(2),'Rent expense','2026-01-01',700,'USD',true);
  await setting(id(1),id(12),{balance:30});
  await setting(id(1),id(11),{balance:20});
  await setting(id(1),id(14),{type:'fixed'});
  await setting(id(1),'Rent expense',{type:'fixed'});
  await db.exec('SET ROLE authenticated');
  const rows=async(key,owner=id(1))=>(await db.query("SELECT to_char(month,'YYYY-MM') AS month,amount::float AS amount,currency,applies_forward AS forward FROM budget_amounts WHERE user_id=$1 AND category_key=$2 ORDER BY month",[owner,key])).rows;
  const settings=async key=>(await db.query('SELECT budget_type,rollover_balance::float AS balance FROM budget_categories WHERE category_key=$1',[key])).rows;

  // Coffee (Jan onwards 100, Feb only 50) into Food (Mar onwards 400): each month is the sum of both.
  await db.query('SELECT delete_transaction_category($1,$2)',[id(12),id(11)]);
  assert.deepEqual(await rows(id(11)),[
   {month:'2026-01',amount:100,currency:'USD',forward:true},
   {month:'2026-02',amount:50,currency:'USD',forward:true},
   {month:'2026-03',amount:500,currency:'USD',forward:true}]);
  assert.deepEqual(await rows(id(12)),[]);
  assert.deepEqual(await settings(id(11)),[{budget_type:'flexible',balance:50}],'the rollover funds add up; Food keeps its settings');
  assert.deepEqual(await settings(id(12)),[]);

  // A budget in another currency is never added under the wrong label: the replacement keeps its own.
  await db.query('SELECT delete_transaction_category($1,$2)',[id(13),id(11)]);
  assert.deepEqual((await rows(id(11))).map(row=>[row.month,row.amount,row.currency]),[['2026-01',100,'USD'],['2026-02',50,'USD'],['2026-03',500,'USD']]);
  assert.deepEqual(await rows(id(13)),[]);

  // Into a new category: the budget and its settings move over; a one-month amount stays one month.
  const treats=(await db.query("SELECT delete_transaction_category($1,null,'Treats') AS data",[id(14)])).rows[0].data.replacement;
  assert.deepEqual(await rows(treats),[{month:'2026-02',amount:20,currency:'USD',forward:false}]);
  assert.deepEqual(await settings(treats),[{budget_type:'fixed',balance:0}]);

  // A built-in kind merges the same way.
  await db.query('SELECT delete_built_in_category($1,$2)',['Charity',id(11)]);
  assert.deepEqual((await rows(id(11))).map(row=>row.amount),[110,60,510]);
  assert.deepEqual(await rows('Charity'),[]);

  // Without a replacement the budget goes with the category; another workspace's is untouched.
  await db.query('SELECT delete_built_in_category($1)',['Rent expense']);
  assert.deepEqual(await rows('Rent expense'),[]);
  assert.deepEqual(await settings('Rent expense'),[]);
  await db.exec('RESET ROLE');
  assert.deepEqual((await rows('Rent expense',id(2))).map(row=>row.amount),[700]);

  // The helper is internal: signed-in callers cannot run it directly.
  await db.exec('SET ROLE authenticated');
  await assert.rejects(db.query("SELECT merge_budget_category($1,'Other expense',null)",[id(1)]),/permission denied/);
 }finally{await db.close();}
});
