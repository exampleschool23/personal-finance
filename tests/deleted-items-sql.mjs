import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('deletion archives atomically; owner-only restore keeps details, dependencies and duplicate safety',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
 const record='20000000-0000-4000-8000-000000000001',plan='20000000-0000-4000-8000-000000000002',payment='20000000-0000-4000-8000-000000000003';
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}'),('${other}');`);
  await db.exec(fs.readFileSync('database/setup.sql','utf8'));
  await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${owner}';INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,end_date,frequency,notes) VALUES('${record}','${owner}','Salary','Salary','USD',1234,'2026-01-01','2026-09-30','Monthly','original');`);
  const original=(await db.query('SELECT * FROM finance_records WHERE id=$1',[record])).rows[0];
  await db.query("SELECT move_item_to_deleted($1,'finance_records')",[record]);
  assert.equal((await db.query('SELECT * FROM finance_records WHERE id=$1',[record])).rows.length,0);
  const archived=(await db.query('SELECT * FROM deleted_items')).rows[0];assert.equal(archived.data.notes,'original');
  await db.exec(`SET request.jwt.claim.sub='${other}'`);
  assert.equal((await db.query('SELECT * FROM deleted_items')).rows.length,0);
  await db.query('SELECT restore_deleted_item($1)',[archived.id]);
  assert.equal((await db.query('SELECT * FROM finance_records')).rows.length,0);
  await db.exec(`SET request.jwt.claim.sub='${owner}'`);
  assert.equal((await db.query('SELECT * FROM deleted_items')).rows.length,1);
  await assert.rejects(db.query("UPDATE deleted_items SET data='{}'"),/permission denied/);
  await db.query('SELECT restore_deleted_item($1)',[archived.id]);await db.query('SELECT restore_deleted_item($1)',[archived.id]);
  assert.deepEqual((await db.query('SELECT * FROM finance_records WHERE id=$1',[record])).rows[0],original);
  assert.equal((await db.query('SELECT * FROM deleted_items')).rows.length,0);
  // A spending plan deleted before plans became Budget categories (migration 130) comes back as a category with its budget.
  await db.exec('RESET ROLE');
  await db.query("INSERT INTO deleted_items(id,user_id,source,data) VALUES($1,$2,'expense_plans',$3)",[payment,owner,{id:plan,user_id:owner,name:'Food',category:'Groceries',currency:'USD',amount:500,start_date:'2026-01-01',end_date:null,created_at:'2026-01-01T00:00:00Z',archived:false,archive_pauses:[]}]);
  await db.exec('SET ROLE authenticated');
  await db.query('SELECT restore_deleted_item($1)',[payment]);
  assert.equal((await db.query('SELECT * FROM deleted_items')).rows.length,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM expense_plans')).rows[0].n,0);
  const food=(await db.query("SELECT id FROM transaction_categories WHERE name='Food' AND direction='expense'")).rows[0].id;
  assert.deepEqual((await db.query("SELECT to_char(month,'YYYY-MM') AS month,amount::float AS amount,currency FROM budget_amounts WHERE category_key=$1",[food])).rows,[{month:'2026-01',amount:500,currency:'USD'}]);
 }finally{await db.close();}
});
