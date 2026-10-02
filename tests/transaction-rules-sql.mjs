import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const id=n=>`e0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('category changes and rules move only plain transactions of the same direction, for their owner',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);
  await db.exec(fs.readFileSync('database/setup.sql','utf8'));
  await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${id(1)}';`);
  const record=(n,name,kind,extra={})=>db.query('INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,import_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id(n),extra.owner??id(1),name,kind,'USD',extra.amount??10,'2026-09-01',extra.frequency??'Once',extra.import_key??null]);
  const row=async n=>(await db.query('SELECT kind,custom_category_id FROM finance_records WHERE id=$1',[id(n)])).rows[0];
  await db.query("SELECT planning_action('category',$1)",[{id:id(50),name:'Coffee',direction:'expense'}]);
  await db.query("SELECT planning_action('category',$1)",[{id:id(51),name:'Tips',direction:'income'}]);
  await record(10,'Starbucks #12','Other expense');await record(11,'STARBUCKS reserve','Living expense');await record(12,'Payroll','Salary');
  await record(13,'Starbucks plan','Living expense',{frequency:'Monthly'});
  // One or many transactions change category; the other direction and schedules are left alone.
  assert.equal((await db.query('SELECT set_transaction_category($1,$2,$3) AS n',[[id(10),id(12),id(13)],'Living expense',null])).rows[0].n,1);
  assert.equal((await row(10)).kind,'Living expense');assert.equal((await row(12)).kind,'Salary');
  assert.equal((await db.query('SELECT set_transaction_category($1,$2,$3) AS n',[[id(10),id(11)],'Other expense',id(50)])).rows[0].n,2);
  assert.deepEqual(await row(11),{kind:'Other expense',custom_category_id:id(50)});
  await assert.rejects(db.query('SELECT set_transaction_category($1,$2,$3)',[[id(10)],'Other expense',id(51)]),/matching the transaction type/);
  await assert.rejects(db.query('SELECT set_transaction_category($1,$2,$3)',[[id(10)],'Living expense',id(50)]),/matching the transaction type/);
  await assert.rejects(db.query('SELECT set_transaction_category($1,$2,$3)',[[id(10)],'Cash',null]),/matching the transaction type/);
  // A rule applies to every matching past transaction of its direction.
  await db.query("INSERT INTO transaction_rules(id,pattern,direction,kind) VALUES($1,'starbucks','expense','Charity')",[id(60)]);
  await assert.rejects(db.query("INSERT INTO transaction_rules(id,pattern,direction,kind) VALUES($1,'pay','expense','Salary')",[id(61)]),/check/i);
  await assert.rejects(db.query("INSERT INTO transaction_rules(id,pattern,direction,kind,category_id) VALUES($1,'pay','expense','Charity',$2)",[id(62),id(50)]),/check/i);
  assert.equal((await db.query('SELECT apply_transaction_rule($1) AS n',[id(60)])).rows[0].n,2);
  assert.equal((await row(10)).kind,'Charity');assert.equal((await row(11)).custom_category_id,null);
  assert.equal((await db.query('SELECT apply_transaction_rule($1) AS n',[id(60)])).rows[0].n,0,'applying again changes nothing');
  // Imported statement rows take a custom-category rule; manual entries keep their own category.
  await db.query("INSERT INTO transaction_rules(id,pattern,direction,kind,category_id) VALUES($1,'coffee','expense','Other expense',$2)",[id(63),id(50)]);
  await record(20,'Coffee corner','Other expense',{import_key:'stmt:1'});await record(21,'Coffee corner','Other expense');
  assert.equal((await row(20)).custom_category_id,id(50));assert.equal((await row(21)).custom_category_id,null);
  // Another owner can neither see the rules nor change these transactions.
  await db.exec(`SET request.jwt.claim.sub='${id(2)}';`);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM transaction_rules')).rows[0].n,0);
  assert.equal((await db.query('SELECT set_transaction_category($1,$2,$3) AS n',[[id(10)],'Living expense',null])).rows[0].n,0);
  await assert.rejects(db.query('SELECT apply_transaction_rule($1)',[id(60)]),/Rule not found/);
  await db.exec(`SET request.jwt.claim.sub='${id(1)}';`);
  assert.equal((await row(10)).kind,'Charity');
 }finally{await db.close();}
});
