import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`74000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/140_income_payments_one_link.sql','utf8');
async function db(sql){const d=new PGlite();await d.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);await d.exec(sql);await d.exec(`SET request.jwt.claim.sub='${id(1)}'`);return d;}
const insert=(d,n,fields,owner=1)=>{const keys=Object.keys(fields);return d.query(`INSERT INTO finance_records(id,user_id,${keys.join(',')}) VALUES($1,$2,${keys.map((_,i)=>'$'+(i+3)).join(',')})`,[id(n),id(owner),...Object.values(fields)]);};
const occurrences=async d=>(await d.query('SELECT record_id,due_on::text AS due_on,status,transaction_id FROM payment_occurrences ORDER BY record_id,due_on')).rows.map(row=>[row.record_id,row.due_on,row.status,row.transaction_id]);
const named=async(d,n)=>{const row=(await d.query('SELECT occurrence_record_id,occurrence_due_on::text AS due FROM finance_records WHERE id=$1',[id(n)])).rows[0];return [row.occurrence_record_id,row.due];};
// EPAM pays a salary on the 5th; a fixed "Tutoring" source (one id with its schedule since migration 132) pays on the 15th.
async function workspace(d){
 await insert(d,12,{name:'EPAM Systems',kind:'Salary',currency:'USD',amount:3450,date:'2026-01-05',frequency:'Monthly'});
 await d.query('SELECT save_income_source($1)',[{id:id(30),name:'Tutoring',kind:'Other income',currency:'USD',mode:'fixed',amount:200,frequency:'Monthly',recurrence_days:null,start_date:'2026-01-15',end_date:null,archived:false,linked_record_id:null}]);
 assert.equal((await d.query('SELECT schedule_id FROM income_sources WHERE id=$1',[id(30)])).rows[0].schedule_id,id(30));
}
const salary=(d,n,extra={})=>insert(d,n,{name:'EPAM Systems',kind:'Salary',currency:'USD',amount:2534,date:'2026-10-05',frequency:'Once',...extra});
const receipt=(d,n,extra={})=>insert(d,n,{name:'Tutoring',kind:'Other income',currency:'USD',amount:200,date:'2026-10-15',frequency:'Once',earning_source_id:id(30),earning_due_on:'2026-10-15',payment_type:'regular',...extra});

test('migration 140 is in setup.sql, gives the older pairs the one link, keeps other owners apart, and is safe to re-run',async()=>{
 assert.ok(setup.includes(migration),'setup.sql includes migration 140');
 const d=await db(setup.slice(0,setup.indexOf(migration)));
 try{
  await workspace(d);
  await salary(d,20,{income_source_id:id(12),income_due_on:'2026-10-05'});
  await receipt(d,21);
  // Another owner's salary plan and receipt.
  await d.exec(`SET request.jwt.claim.sub='${id(2)}'`);
  await insert(d,42,{name:'Other job',kind:'Salary',currency:'USD',amount:100,date:'2026-01-05',frequency:'Monthly'},2);
  await insert(d,40,{name:'Other job',kind:'Salary',currency:'USD',amount:100,date:'2026-10-05',frequency:'Once',income_source_id:id(42),income_due_on:'2026-10-05'},2);
  await d.exec(`SET request.jwt.claim.sub='${id(1)}'`);
  // A deleted salary receipt with its occurrence, as delete_linked_transaction keeps it.
  await d.query("INSERT INTO deleted_items(id,user_id,source,data,occurrences) VALUES($1,$2,'finance_records',$3,$4)",[id(60),id(1),{id:id(50),name:'EPAM Systems',kind:'Salary',currency:'USD',amount:3450,date:'2026-09-05',frequency:'Once',income_source_id:id(12),income_due_on:'2026-09-05',occurrence_record_id:null,occurrence_due_on:null},[{id:id(61),user_id:id(1),record_id:id(12),due_on:'2026-09-05',status:'paid',transaction_id:id(50)}]]);
  // Before: the older triggers wrote the occurrence rows, the payments' own columns stayed empty.
  const before=await occurrences(d);
  assert.deepEqual(before,[[id(12),'2026-10-05','paid',id(20)],[id(30),'2026-10-15','paid',id(21)],[id(42),'2026-10-05','paid',id(40)]]);
  assert.deepEqual([await named(d,20),await named(d,21),await named(d,40)],[[null,null],[null,null],[null,null]]);
  const revision=(await d.query('SELECT revision FROM finance_records WHERE id=$1',[id(20)])).rows[0].revision;

  await d.exec(migration);await d.exec(migration);
  assert.deepEqual([await named(d,20),await named(d,21),await named(d,40)],[[id(12),'2026-10-05'],[id(30),'2026-10-15'],[id(42),'2026-10-05']]);
  assert.deepEqual(await occurrences(d),before,'no occurrence is written or duplicated');
  assert.equal((await d.query('SELECT revision FROM finance_records WHERE id=$1',[id(20)])).rows[0].revision,revision,'copying the link is not an edit');
  const bin=(await d.query('SELECT data FROM deleted_items WHERE id=$1',[id(60)])).rows[0].data;
  assert.deepEqual([bin.occurrence_record_id,bin.occurrence_due_on],[id(12),'2026-09-05']);
 }finally{await d.close();}
});

test('a source receipt and a salary with a plan name their schedule as they are saved, with one occurrence row each',async()=>{
 const d=await db(setup);
 try{
  await workspace(d);
  await receipt(d,21);
  await salary(d,20,{income_source_id:id(12),income_due_on:'2026-10-05'});
  assert.deepEqual([await named(d,20),await named(d,21)],[[id(12),'2026-10-05'],[id(30),'2026-10-15']]);
  assert.deepEqual(await occurrences(d),[[id(12),'2026-10-05','paid',id(20)],[id(30),'2026-10-15','paid',id(21)]]);
  // An edit keeps the link; the due date it was taken from cannot move; a second receipt of the same due date is still refused.
  await d.query('UPDATE finance_records SET amount=2600 WHERE id=$1',[id(20)]);
  assert.deepEqual([await named(d,20),await occurrences(d)],[[id(12),'2026-10-05'],[[id(12),'2026-10-05','paid',id(20)],[id(30),'2026-10-15','paid',id(21)]]]);
  await assert.rejects(d.query("UPDATE finance_records SET income_due_on='2026-11-05' WHERE id=$1",[id(20)]),/keeps its schedule/);
  await assert.rejects(d.query("UPDATE finance_records SET earning_due_on='2026-11-15' WHERE id=$1",[id(21)]),/keeps its schedule/);
  await assert.rejects(receipt(d,22),/already recorded/);
  // A bonus and a variable source's receipt pay no schedule.
  await receipt(d,23,{kind:'Other income',earning_due_on:null,payment_type:'bonus'});
  assert.deepEqual(await named(d,23),[null,null]);
 }finally{await d.close();}
});

test('a saved payment that named no schedule may name one when edited; a named schedule never changes',async()=>{
 const d=await db(setup);
 try{
  await workspace(d);
  await salary(d,22);
  assert.deepEqual([await named(d,22),await occurrences(d)],[[null,null],[]],'never linked by its name');
  await d.query('UPDATE finance_records SET occurrence_record_id=$2 WHERE id=$1',[id(22),id(12)]);
  assert.deepEqual([await named(d,22),await occurrences(d)],[[id(12),'2026-10-05'],[[id(12),'2026-10-05','paid',id(22)]]]);
  await assert.rejects(d.query('UPDATE finance_records SET occurrence_record_id=NULL WHERE id=$1',[id(22)]),/keeps its schedule/);
  await assert.rejects(d.query('UPDATE finance_records SET occurrence_record_id=$2 WHERE id=$1',[id(22),id(30)]),/keeps its schedule/);
 }finally{await d.close();}
});
