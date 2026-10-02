import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const id=n=>`f0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('budget amounts follow the edit scope, stay whole months and are private to their owner',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);
  await db.exec(fs.readFileSync('database/setup.sql','utf8'));
  await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${id(1)}';`);
  const set=(key,month,amount,forward)=>db.query('SELECT set_budget_amount($1,$2,$3,$4,$5)',[key,month,amount,'USD',forward]);
  const rows=async()=>(await db.query("SELECT category_key,month::text,amount::numeric AS amount,applies_forward FROM budget_amounts ORDER BY category_key,month")).rows.map(r=>[r.category_key,r.month,Number(r.amount),r.applies_forward]);
  await set('Groceries','2026-03-01',400,true);
  await set('Groceries','2026-06-01',300,false);
  await set('Groceries','2026-09-01',250,false);
  assert.deepEqual(await rows(),[['Groceries','2026-03-01',400,true],['Groceries','2026-06-01',300,false],['Groceries','2026-09-01',250,false]]);
  // All future months replaces later amounts.
  await set('Groceries','2026-05-01',350,true);
  assert.deepEqual(await rows(),[['Groceries','2026-03-01',400,true],['Groceries','2026-05-01',350,true]]);
  // One month over a forward amount moves the forward amount on to the next month.
  await set('Groceries','2026-05-01',100,false);
  assert.deepEqual(await rows(),[['Groceries','2026-03-01',400,true],['Groceries','2026-05-01',100,false],['Groceries','2026-06-01',350,true]]);
  await set('Groceries','2026-07-01',13782.113487716848,false);
  assert.equal((await db.query("SELECT amount::text FROM budget_amounts WHERE month='2026-07-01'")).rows[0].amount,'13782.113487716848','typed precision is kept');
  await assert.rejects(set('Groceries','2026-07-15',1,false),/whole months/);
  await assert.rejects(set('Groceries','2026-08-01',-1,false),/check/i);
  await db.exec(`INSERT INTO budget_categories(category_key,budget_type,rollover,rollover_start) VALUES('Groceries','non_monthly',true,'2026-03-01');INSERT INTO budget_settings(mode,apply_forward) VALUES('flex',true);`);
  await assert.rejects(db.exec(`INSERT INTO budget_categories(category_key,budget_type) VALUES('Rent','weekly')`),/check/i);
  // Another owner sees and changes nothing.
  await db.exec(`SET request.jwt.claim.sub='${id(2)}';`);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM budget_amounts')).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM budget_categories')).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM budget_settings')).rows[0].n,0);
  await set('Groceries','2026-05-01',1,true);
  await assert.rejects(db.exec(`INSERT INTO budget_amounts(user_id,category_key,month,amount,currency) VALUES('${id(1)}','Rent','2026-01-01',5,'USD')`),/row-level security/);
  await db.exec(`SET request.jwt.claim.sub='${id(1)}';`);
  assert.equal((await rows()).length,4,'the other owner did not replace these amounts');
  await db.exec('RESET ROLE;SET ROLE anon;');
  await assert.rejects(db.query('SELECT * FROM budget_amounts'),/permission denied/);
 }finally{await db.close();}
});
