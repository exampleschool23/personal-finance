import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`59000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('verified backup restores exact balances and history atomically without replay, rejects changes and other owners',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);
 await db.exec(fs.readFileSync('database/setup.sql','utf8'));
 await db.exec(`SET request.jwt.claim.sub='${id(1)}';INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES('${id(10)}','${id(1)}','Cash','Cash','USD',1000.12345678,'2020-01-01','Once'),('${id(11)}','${id(1)}','Business','Business','USD',2000,'2020-01-01','Once'),('${id(12)}','${id(2)}','Private','Cash','USD',900,'2020-01-01','Once');INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,account_id) VALUES('${id(20)}','${id(1)}','Food','Living expense','USD',100.12345678,'2020-01-02','Once','${id(10)}');SET ROLE authenticated;`);
 await db.exec(`INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,opened_on) VALUES('${id(30)}','${id(1)}','Mortgage','Mortgage','USD',1000,'2027-01-01','Once','2020-01-01');`);
 await db.query('SELECT record_mortgage_payment($1,$2,100,10,$3,$4)',[id(31),id(30),'2020-02-01','']);
 await db.query('SELECT save_income_source($1)',[{id:id(40),name:'Salary',kind:'Salary',currency:'USD',mode:'fixed',amount:500,frequency:'Monthly',start_date:'2020-01-01',end_date:null,linked_record_id:null,archived:false}]);
 const backup=(await db.query('SELECT export_finance_backup()::text AS backup')).rows[0].backup;
 const parsed=JSON.parse(backup);assert.equal(parsed.version,2);assert.ok(parsed.tables.finance_records.length>3);assert.ok(parsed.tables.mortgage_payments.length>0);assert.ok(parsed.tables.income_sources.length>0);
 const preview=async text=>(await db.query('SELECT preview_finance_restore($1) AS result',[text])).rows[0].result;
 const firstPreview=await preview(backup);assert.equal(firstPreview.current_records,parsed.tables.finance_records.length);
 await assert.rejects(db.query('SELECT restore_finance_backup($1,$2)',[backup,'stale']),/workspace changed/);
 await assert.rejects(preview(backup.replace('Food','Tampered')),/unchanged verified/);
 await db.exec(`SET request.jwt.claim.sub='${id(2)}'`);await assert.rejects(preview(backup),/unchanged verified/);
 await assert.rejects(db.query("INSERT INTO backup_manifests(id,user_id,digest) VALUES($1,$2,'bad')",[id(99),id(2)]),/permission denied/);
 await db.exec(`SET request.jwt.claim.sub='${id(1)}';UPDATE finance_records SET name='Changed' WHERE id='${id(20)}';`);
 await assert.rejects(db.query('SELECT restore_finance_backup($1,$2)',[backup,firstPreview.expected_state]),/workspace changed/);
 const nextPreview=await preview(backup);
 // Simulate a future incompatible constraint and verify full rollback, including
 // the private restore context and automatically generated recovery copy.
 await db.exec("RESET ROLE;ALTER TABLE finance_records ADD CONSTRAINT fail_restore CHECK(name<>'Food') NOT VALID;SET ROLE authenticated;");
 await assert.rejects(db.query('SELECT restore_finance_backup($1,$2)',[backup,nextPreview.expected_state]),/fail_restore/);
 assert.equal((await db.query('SELECT name FROM finance_records WHERE id=$1',[id(20)])).rows[0].name,'Changed');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM backup_recovery_points')).rows[0].n,0);
 assert.equal((await db.query('SELECT finance_restore_active() AS active')).rows[0].active,false);
 await db.exec('RESET ROLE;ALTER TABLE finance_records DROP CONSTRAINT fail_restore;SET ROLE authenticated;');
 const result=(await db.query('SELECT restore_finance_backup($1,$2) AS result',[backup,nextPreview.expected_state])).rows[0].result;
 const retried=(await db.query('SELECT restore_finance_backup($1,$2) AS result',[backup,nextPreview.expected_state])).rows[0].result;assert.deepEqual(retried,result);
 const recovery=(await db.query('SELECT backup FROM backup_recovery_points WHERE id=$1',[result.recovery_id])).rows[0].backup;
 assert.ok(recovery.tables.finance_records.some(row=>row.name==='Changed'));
 const restored=(await db.query('SELECT export_finance_backup() AS backup')).rows[0].backup;
 for(const name of Object.keys(parsed.tables)){
  const sort=rows=>rows.map(row=>JSON.stringify(row)).sort();
  assert.deepEqual(sort(restored.tables[name]),sort(parsed.tables[name]),name);
 }
 assert.equal(Number((await db.query('SELECT amount FROM finance_records WHERE id=$1',[id(10)])).rows[0].amount),900);
 await db.exec(`RESET ROLE;`);
 assert.equal((await db.query('SELECT amount FROM finance_records WHERE id=$1',[id(12)])).rows[0].amount,'900');
 assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='D'")).rows[0].n,0);
 }finally{await db.close();}
});
