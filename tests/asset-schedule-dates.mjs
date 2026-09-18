import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`54000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('asset date saves update linked schedules without changing receipts or other owners',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);
 await db.exec(fs.readFileSync('database/setup.sql','utf8'));
 await db.exec(`SET request.jwt.claim.sub='${id(1)}';INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,estimated_monthly_income) VALUES('${id(10)}','${id(1)}','Business','Business','USD',1000,'2020-01-11','Once',1500),('${id(11)}','${id(1)}','Cash','Cash','USD',100,'2020-01-01','Once',0);SET ROLE authenticated;`);
 const source=async()=>(await db.query('SELECT * FROM income_sources WHERE linked_record_id=$1',[id(10)])).rows[0];
 const original=await source();
 await db.query("SELECT planning_action_with_actual_amount('occurrence',$1)",[{id:id(20),account_id:id(11),target_id:original.schedule_id,date:'2020-02-11',amount:1250,notes:''}]);
 await db.query("UPDATE finance_records SET date='2020-10-01' WHERE id=$1",[id(10)]);
 assert.equal(new Date((await source()).start_date).toISOString().slice(0,10),'2020-10-01');
 const schedule=(await db.query('SELECT * FROM finance_records WHERE id=$1',[original.schedule_id])).rows[0];
 assert.equal(new Date(schedule.date).toISOString().slice(0,10),'2020-10-01');
 assert.equal(Number(schedule.amount),1500);
 const receipt=(await db.query('SELECT * FROM finance_records WHERE id=$1',[id(20)])).rows[0];
 assert.equal(new Date(receipt.date).toISOString().slice(0,10),'2020-02-11');assert.equal(Number(receipt.amount),1250);
 assert.equal((await db.query('SELECT * FROM payment_occurrences')).rows.length,1);
 await db.exec(`SET request.jwt.claim.sub='${id(2)}'`);
 assert.equal((await db.query("UPDATE finance_records SET date='2020-11-01' WHERE id=$1 RETURNING id",[id(10)])).rows.length,0);
 assert.equal((await db.query('SELECT * FROM income_sources')).rows.length,0);
 }finally{await db.close();}
});
