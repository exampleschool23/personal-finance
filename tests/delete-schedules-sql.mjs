import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`69000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/113_delete_schedules.sql','utf8');
async function db(sql){const d=new PGlite();await d.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);await d.exec(sql);return d;}
const signIn=(d,n=1)=>d.exec(`SET request.jwt.claim.sub='${id(n)}';SET ROLE authenticated;`);

/** A cash account of 1,000 and a monthly income with two payments recorded this month: 700, then 800 more. */
async function paidSchedule(d){
 const {month}=(await d.query("SELECT date_trunc('month',(now() AT TIME ZONE 'Asia/Tashkent')::date)::date::text AS month")).rows[0];
 await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,opened_on) VALUES($1,$2,'Cash','Cash','USD',1000,$3,$3)",[id(10),id(1),month]);
 await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES($1,$2,'Freelancing','Other income','USD',6000,$3,'Monthly')",[id(20),id(1),month]);
 await d.query('SELECT planning_action_with_actual_amount($1,$2)',['occurrence',{id:id(21),account_id:id(10),target_id:id(20),date:month,amount:700,notes:''}]);
 await d.query('SELECT record_occurrence_extra($1)',[{id:id(22),account_id:id(10),target_id:id(20),date:month,amount:800,notes:''}]);
 return month;
}
const cash=async d=>Number((await d.query('SELECT amount FROM finance_records WHERE id=$1',[id(10)])).rows[0].amount);
const exists=async(d,n)=>(await d.query('SELECT 1 FROM finance_records WHERE id=$1',[id(n)])).rows.length>0;
const remove=(d,source,n,history)=>d.query('SELECT delete_schedule($1,$2,$3)',[source,id(n),history]);

test('migration 113 is in setup.sql and safe to re-run',async()=>{
 assert.ok(setup.includes(migration),'setup.sql includes migration 113');
 const d=await db(setup.slice(0,setup.indexOf(migration)));
 try{await d.exec(migration);await d.exec(migration);}finally{await d.close();}
});

test('deleting a schedule and keeping its history leaves the payments and balance, and restoring links them again',async()=>{
 const d=await db(setup);
 try{
  await signIn(d);const month=await paidSchedule(d);
  assert.equal(await cash(d),2500);
  await remove(d,'record',20,false);
  await remove(d,'record',20,false);
  assert.equal(await exists(d,20),false,'the schedule is gone');
  assert.ok(await exists(d,21)&&await exists(d,22),'both payments stay');
  assert.equal(await cash(d),2500,'no cash moves');
  const bin=(await d.query("SELECT id,data->>'id' AS record FROM deleted_items")).rows;
  assert.deepEqual(bin.map(row=>row.record),[id(20)],'only the schedule is in Recently deleted');
  await d.query('SELECT restore_deleted_item($1)',[bin[0].id]);
  const occurrence=(await d.query('SELECT due_on::text AS due,status,transaction_id FROM payment_occurrences WHERE record_id=$1',[id(20)])).rows;
  assert.deepEqual(occurrence,[{due:month,status:'paid',transaction_id:id(21)}],'the recorded month is paid again');
 }finally{await d.close();}
});

test('deleting a schedule with its history moves every payment to Recently deleted and reverses the cash',async()=>{
 const d=await db(setup);
 try{
  await signIn(d);await paidSchedule(d);
  await remove(d,'record',20,true);
  for(const n of [20,21,22])assert.equal(await exists(d,n),false,'record '+n);
  assert.equal(await cash(d),1000,'both payments are reversed');
  assert.equal((await d.query('SELECT count(*)::int AS n FROM payment_occurrences')).rows[0].n,0);
  assert.equal((await d.query('SELECT count(*)::int AS n FROM deleted_items')).rows[0].n,3,'the schedule and both payments can be restored');
 }finally{await d.close();}
});

test('only repeating income and expenses of the open workspace are deleted here',async()=>{
 const d=await db(setup);
 try{
  await signIn(d);await paidSchedule(d);
  await assert.rejects(remove(d,'record',10,false),/Only repeating income and expenses/,'not an account');
  await assert.rejects(remove(d,'record',21,false),/Only repeating income and expenses/,'not a single transaction');
  await assert.rejects(d.query('SELECT delete_schedule($1,$2,$3)',['account',id(20),false]),/Check the record fields/);
  await d.exec(`SET request.jwt.claim.sub='${id(2)}';`);
  await remove(d,'record',20,true);
  await d.exec(`SET request.jwt.claim.sub='${id(1)}';`);
  assert.ok(await exists(d,20)&&await exists(d,21),'another person cannot delete it');
 }finally{await d.close();}
});
