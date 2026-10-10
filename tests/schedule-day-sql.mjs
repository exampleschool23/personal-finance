import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`75000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/141_schedule_day_and_currency.sql','utf8');
async function db(sql){const d=new PGlite();await d.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}');`);await d.exec(sql);await d.exec(`SET request.jwt.claim.sub='${id(1)}'`);return d;}
const insert=(d,n,fields)=>{const keys=Object.keys(fields);return d.query(`INSERT INTO finance_records(id,user_id,${keys.join(',')}) VALUES($1,$2,${keys.map((_,i)=>'$'+(i+3)).join(',')})`,[id(n),id(1),...Object.values(fields)]);};
const occurrences=async d=>(await d.query('SELECT record_id,due_on::text AS due_on,status,transaction_id FROM payment_occurrences ORDER BY record_id,due_on')).rows.map(row=>[row.record_id,row.due_on,row.status,row.transaction_id]);
const column=async(d,n,name)=>(await d.query(`SELECT ${name}::text AS value FROM finance_records WHERE id=$1`,[id(n)])).rows[0].value;
const refused=/Keep the schedule compatible with settled payments/;
// Dildora is paid a monthly allowance on the 5th; September and October are paid, November is skipped.
async function workspace(d){
 await insert(d,10,{name:'Dildora Wife',kind:'Living expense',currency:'USD',amount:253,date:'2026-09-05',frequency:'Monthly'});
 await insert(d,20,{name:'Dildora Wife',kind:'Living expense',currency:'USD',amount:255,date:'2026-09-05',frequency:'Once',occurrence_record_id:id(10)});
 await insert(d,21,{name:'Dildora Wife',kind:'Living expense',currency:'UZS',amount:3000000,date:'2026-10-05',frequency:'Once',occurrence_record_id:id(10)});
 await d.query("INSERT INTO payment_occurrences(id,user_id,record_id,due_on,status) VALUES($1,$2,$3,'2026-11-05','dismissed')",[id(30),id(1),id(10)]);
 assert.deepEqual(await occurrences(d),[[id(10),'2026-09-05','paid',id(20)],[id(10),'2026-10-05','paid',id(21)],[id(10),'2026-11-05','dismissed',null]]);
}

test('migration 141 is in setup.sql and safe to re-run',async()=>{
 assert.ok(setup.includes(migration),'setup.sql includes migration 141');
 const d=await db(setup.slice(0,setup.indexOf(migration)));
 try{await d.exec(migration);await d.exec(migration);assert.equal((await d.query('SELECT finance_capabilities() AS c')).rows[0].c.schema_version,141);}finally{await d.close();}
});

test('a monthly schedule with payments moves to another day: each occurrence and its payment follow within its own month',async()=>{
 const d=await db(setup);
 try{
  await workspace(d);
  await d.query("UPDATE finance_records SET date='2026-09-20' WHERE id=$1",[id(10)]);
  assert.deepEqual(await occurrences(d),[[id(10),'2026-09-20','paid',id(20)],[id(10),'2026-10-20','paid',id(21)],[id(10),'2026-11-20','dismissed',null]]);
  assert.deepEqual([await column(d,20,'occurrence_due_on'),await column(d,21,'occurrence_due_on')],['2026-09-20','2026-10-20']);
  assert.deepEqual([await column(d,20,'date'),await column(d,21,'date')],['2026-09-05','2026-10-05'],'the payments keep the day they were made');
  // The 30th falls on the last day of a shorter month: February has 28 days.
  await insert(d,40,{name:'Gym',kind:'Living expense',currency:'USD',amount:60,date:'2026-01-10',frequency:'Monthly'});
  await insert(d,41,{name:'Gym',kind:'Living expense',currency:'USD',amount:60,date:'2026-02-10',frequency:'Once',occurrence_record_id:id(40)});
  assert.equal(await column(d,41,'occurrence_due_on'),'2026-02-10');
  await d.query("UPDATE finance_records SET date='2026-01-30' WHERE id=$1",[id(40)]);
  assert.equal(await column(d,41,'occurrence_due_on'),'2026-02-28');
  // Back to an earlier day: the payment still pays February.
  await d.query("UPDATE finance_records SET date='2026-01-03' WHERE id=$1",[id(40)]);
  assert.equal(await column(d,41,'occurrence_due_on'),'2026-02-03');
 }finally{await d.close();}
});

test('the start date, the kind and the cadence stay; the amount and the currency may change',async()=>{
 const d=await db(setup);
 try{
  await workspace(d);
  await d.query("UPDATE finance_records SET amount=3000000,currency='UZS' WHERE id=$1",[id(10)]);
  assert.deepEqual([await column(d,10,'amount'),await column(d,10,'currency')],['3000000','UZS']);
  assert.equal((await occurrences(d)).length,3,'payments made before the change stay');
  await assert.rejects(d.query("UPDATE finance_records SET date='2026-08-05' WHERE id=$1",[id(10)]),refused,'another month is another start date');
  await assert.rejects(d.query("UPDATE finance_records SET date='2026-10-05' WHERE id=$1",[id(10)]),refused);
  await assert.rejects(d.query("UPDATE finance_records SET frequency='Weekly' WHERE id=$1",[id(10)]),refused);
  await assert.rejects(d.query("UPDATE finance_records SET kind='Salary' WHERE id=$1",[id(10)]),refused);
  // A weekly schedule keeps its start date: its weekday is its cadence.
  await insert(d,50,{name:'Cleaner',kind:'Living expense',currency:'USD',amount:20,date:'2026-09-07',frequency:'Weekly'});
  await insert(d,51,{name:'Cleaner',kind:'Living expense',currency:'USD',amount:20,date:'2026-09-07',frequency:'Once',occurrence_record_id:id(50)});
  await assert.rejects(d.query("UPDATE finance_records SET date='2026-09-08' WHERE id=$1",[id(50)]),refused);
 }finally{await d.close();}
});

test('a salary recorded against its plan follows the plan to its new pay day',async()=>{
 const d=await db(setup);
 try{
  await insert(d,60,{name:'EPAM Systems',kind:'Salary',currency:'USD',amount:3450,date:'2026-01-05',frequency:'Monthly'});
  await insert(d,61,{name:'EPAM Systems',kind:'Salary',currency:'USD',amount:2534,date:'2026-10-05',frequency:'Once',income_source_id:id(60),income_due_on:'2026-10-05'});
  await d.query("UPDATE finance_records SET date='2026-01-10' WHERE id=$1",[id(60)]);
  assert.deepEqual([await column(d,61,'income_due_on'),await column(d,61,'occurrence_due_on')],['2026-10-10','2026-10-10']);
  assert.deepEqual(await occurrences(d),[[id(60),'2026-10-10','paid',id(61)]]);
 }finally{await d.close();}
});
