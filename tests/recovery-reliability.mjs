import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {loadTS} from './helpers/load-ts.mjs';
const id=n=>`61000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const setup=fs.readFileSync('database/setup.sql','utf8');
async function database(sql=setup){
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);
 await db.exec(sql);await db.exec(`SET request.jwt.claim.sub='${id(1)}';SET ROLE authenticated;`);return db;
}
async function cash(db,n=10){await db.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES($1,$2,'Cash','Cash','USD',1000.12345678,'2020-01-01','Once')",[id(n),id(1)]);}
test('pre-revision archives restore and unchanged imports undo after incremental upgrades; edits and owners stay protected',async()=>{
 const db=await database(setup.split('BEGIN;\nALTER TABLE public.finance_records ADD COLUMN revision')[0]);
 try{
  await cash(db);await cash(db,11);
  await db.query('SELECT move_item_to_deleted($1,$2)',[id(11),'finance_records']);
  const deleted=(await db.query('SELECT id FROM deleted_items')).rows[0].id;
  const rows=[{name:'Shop',amount:-5.12345678,date:'2026-01-02',notes:'',key:'a'.repeat(64)}];
  await db.query('SELECT import_statement($1,$2,$3)',[id(20),id(10),rows]);
  await db.exec('RESET ROLE');
  for(const name of fs.readdirSync('migrations').filter(n=>Number(n.slice(0,3))>=58).sort())await db.exec(fs.readFileSync('migrations/'+name,'utf8'));
  await db.exec('SET ROLE authenticated');
  await db.exec(`SET request.jwt.claim.sub='${id(2)}'`);
  await db.query('SELECT restore_deleted_item($1)',[deleted]);
  await assert.rejects(db.query('SELECT undo_statement_import($1)',[id(20)]),/not found/);
  await db.exec(`SET request.jwt.claim.sub='${id(1)}'`);
  await db.query('SELECT restore_deleted_item($1)',[deleted]);
  const restored=(await db.query('SELECT * FROM finance_records WHERE id=$1',[id(11)])).rows[0];
  assert.equal(restored.amount,'1000.12345678');assert.equal(restored.revision,1);
  await db.query('SELECT undo_statement_import($1)',[id(20)]);
  assert.equal((await db.query('SELECT amount=1000.12345678 AS exact FROM finance_records WHERE id=$1',[id(10)])).rows[0].exact,true);
  await db.query('SELECT import_statement($1,$2,$3)',[id(21),id(10),rows]);
  await db.query("UPDATE finance_records SET notes='changed' WHERE import_key=$1",[rows[0].key]);
  await assert.rejects(db.query('SELECT undo_statement_import($1)',[id(21)]),/changed/);
  // Expense plan archives must use their own row shape, not finance-record defaults.
  await db.query("INSERT INTO expense_plans(id,user_id,name,category,currency,amount,start_date) VALUES($1,$2,'Budget','Other','USD',12.345678,'2026-01-01')",[id(30),id(1)]);
  await db.query('SELECT move_item_to_deleted($1,$2)',[id(30),'expense_plans']);
  const plan=(await db.query("SELECT id FROM deleted_items WHERE source='expense_plans'")).rows[0].id;
  await db.query('SELECT restore_deleted_item($1)',[plan]);
  assert.equal((await db.query('SELECT amount FROM expense_plans WHERE id=$1',[id(30)])).rows[0].amount,'12.345678');
 }finally{await db.close();}
});
test('restore avoids global table locks and callers cannot forge the private bypass',async()=>{
 const db=await database();try{
  await cash(db);
  await assert.rejects(db.query('INSERT INTO finance_restore_context VALUES(txid_current(),$1)',[id(1)]),/permission denied/);
  await db.exec("SET finance.restore_active='1'");
  assert.equal((await db.query('SELECT finance_restore_active() AS active')).rows[0].active,false);
  await db.query("UPDATE finance_records SET name='Changed' WHERE id=$1",[id(10)]);
  assert.equal((await db.query('SELECT revision FROM finance_records WHERE id=$1',[id(10)])).rows[0].revision,2);
  const backup=(await db.query('SELECT export_finance_backup()::text AS b')).rows[0].b;
  const preview=(await db.query('SELECT preview_finance_restore($1) AS p',[backup])).rows[0].p;
  await db.exec('BEGIN');await db.query('SELECT restore_finance_backup($1,$2)',[backup,preview.expected_state]);
  const exclusive=(await db.query("SELECT mode FROM pg_locks WHERE locktype='relation' AND mode='AccessExclusiveLock'")).rows;
  assert.deepEqual(exclusive,[]);assert.equal((await db.query('SELECT finance_restore_active() AS active')).rows[0].active,false);
  await db.exec('COMMIT;RESET ROLE');
  assert.equal((await db.query('SELECT * FROM finance_restore_context')).rows.length,0);
 }finally{await db.close();}
});
test('a signed backup restores into an empty database without its original manifest',async()=>{
 const oldKey=process.env.BACKUP_SIGNING_KEY;process.env.BACKUP_SIGNING_KEY='test-only-independent-signing-key-'.repeat(2);
 const {signBackup,verifyBackup}=loadTS('lib/backup-signature.ts');
 const source=await database(),target=await database();try{
  await cash(source);const raw=(await source.query('SELECT export_finance_backup()::text AS b')).rows[0].b;
  const verified=verifyBackup(signBackup(raw));assert.equal(verified.backup,raw);assert.equal(verified.portable,true);
  await assert.rejects(target.query('SELECT preview_finance_restore($1)',[raw]),/unchanged verified/);
  await assert.rejects(target.query('SELECT register_verified_finance_backup($1,$2)',[raw,id(1)]),/permission denied/);
  await target.exec('RESET ROLE;SET ROLE service_role');
  await assert.rejects(target.query('SELECT register_verified_finance_backup($1,$2)',[raw,id(2)]),/unchanged verified/);
  await target.query('SELECT register_verified_finance_backup($1,$2)',[verified.backup,id(1)]);
  await target.exec('RESET ROLE;SET ROLE authenticated');
  const preview=(await target.query('SELECT preview_finance_restore($1) AS p',[raw])).rows[0].p;
  await target.query('SELECT restore_finance_backup($1,$2)',[raw,preview.expected_state]);
  assert.equal((await target.query('SELECT amount=1000.12345678 AS exact FROM finance_records WHERE id=$1',[id(10)])).rows[0].exact,true);
 }finally{await source.close();await target.close();if(oldKey===undefined)delete process.env.BACKUP_SIGNING_KEY;else process.env.BACKUP_SIGNING_KEY=oldKey;}
});
