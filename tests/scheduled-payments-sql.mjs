import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`68000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/109_zero_scheduled_payments.sql','utf8');
async function db(sql){const d=new PGlite();await d.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);await d.exec(sql);return d;}
const signIn=d=>d.exec(`SET request.jwt.claim.sub='${id(1)}';SET ROLE authenticated;`);

test('migration 109 patches the installed occurrence function once and is safe to re-run',async()=>{
 assert.ok(setup.includes(migration),'setup.sql includes migration 109');
 const d=await db(setup.slice(0,setup.indexOf(migration)));
 try{await d.exec(migration);await d.exec(migration);
  const definition=(await d.query("SELECT pg_get_functiondef('public.planning_action_with_actual_amount(text,jsonb)'::regprocedure) AS f")).rows[0].f;
  assert.match(definition,/amount<0 OR amount>1e15/);assert.doesNotMatch(definition,/amount<=0 OR amount>1e15 OR amount::text IN \('NaN','Infinity','-Infinity'\) THEN RAISE EXCEPTION 'Check the account fields.'; END IF;\s+new_id/);
 }finally{await d.close();}
});

test('a scheduled payment can be recorded as 0 with its note and no cash moved, but never before it is due',async()=>{
 const d=await db(setup);
 try{
  await signIn(d);
  const {month,next}=(await d.query("SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS today,date_trunc('month',(now() AT TIME ZONE 'Asia/Tashkent')::date)::date::text AS month,(date_trunc('month',(now() AT TIME ZONE 'Asia/Tashkent')::date)+interval '1 month')::date::text AS next")).rows[0];
  await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,opened_on) VALUES($1,$2,'Cash','Cash','USD',1000,$3,$3)",[id(10),id(1),month]);
  await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES($1,$2,'Solar panel','Other income','USD',500,$3,'Monthly')",[id(20),id(1),month]);
  const cash=async()=>Number((await d.query('SELECT amount FROM finance_records WHERE id=$1',[id(10)])).rows[0].amount);
  const pay=(n,date,amount,notes='')=>d.query('SELECT planning_action_with_actual_amount($1,$2)',['occurrence',{id:id(n),account_id:id(10),target_id:id(20),date,amount,notes}]);
  // Not before it is due: next month's occurrence waits for its date.
  await assert.rejects(pay(30,next,300),/Check the payment date/);
  assert.equal(await cash(),1000);
  await assert.rejects(pay(32,month,-1),/Check the account fields/,'a negative amount is refused');
  // Zero: nothing arrived this month. The occurrence is settled with a 0 transaction that keeps the note.
  await pay(31,month,0,'No profit this month');
  const zero=(await d.query('SELECT amount,date::text,notes FROM finance_records WHERE id=$1',[id(31)])).rows[0];
  assert.deepEqual({amount:Number(zero.amount),date:zero.date,notes:zero.notes},{amount:0,date:month,notes:'No profit this month'});
  assert.equal((await d.query('SELECT status FROM payment_occurrences WHERE record_id=$1 AND due_on=$2',[id(20),month])).rows[0].status,'paid');
  assert.equal(await cash(),1000,'no cash moves');
  // Another person's schedule stays out of reach.
  await d.exec(`SET request.jwt.claim.sub='${id(2)}';`);
  await assert.rejects(pay(50,month,1),/Record not found/);
 }finally{await d.close();}
});

test('migration 110 dates a scheduled payment on the day it was paid, never ahead, and keeps the occurrence on its due date',async()=>{
 const later=fs.readFileSync('migrations/110_scheduled_payment_date.sql','utf8');
 const start=setup.indexOf(later);
 assert.ok(start>0,'setup.sql includes migration 110');
 const upgraded=await db(setup.slice(0,start));
 try{await upgraded.exec(later);await upgraded.exec(later);}finally{await upgraded.close();}
 const d=await db(setup);
 try{
  await signIn(d);
  const {today,month,earlier}=(await d.query("SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS today,date_trunc('month',(now() AT TIME ZONE 'Asia/Tashkent')::date - interval '1 month')::date::text AS month,(date_trunc('month',(now() AT TIME ZONE 'Asia/Tashkent')::date - interval '1 month')::date + 3)::text AS earlier")).rows[0];
  await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,opened_on) VALUES($1,$2,'Cash','Cash','USD',1000,$3,$3)",[id(60),id(1),month]);
  await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES($1,$2,'Club','Other income','USD',500,$3,'Monthly')",[id(61),id(1),month]);
  const pay=(n,paid_on)=>d.query('SELECT planning_action_with_actual_amount($1,$2)',['occurrence',{id:id(n),account_id:id(60),target_id:id(61),date:month,amount:450,notes:'',...(paid_on?{paid_on}:{})}]);
  await assert.rejects(pay(62,(await d.query("SELECT ($1::date+1)::text AS d",[today])).rows[0].d),/Check the payment date/,'not a future day');
  await pay(63,earlier);
  assert.equal((await d.query('SELECT date::text FROM finance_records WHERE id=$1',[id(63)])).rows[0].date,earlier,'the transaction is dated when it was paid');
  assert.equal((await d.query('SELECT due_on::text FROM payment_occurrences WHERE transaction_id=$1',[id(63)])).rows[0].due_on,month,'the occurrence keeps its due date');
 }finally{await d.close();}
});


test('migration 111 adds archiving to schedules and spending plans, is safe to re-run, and archives without touching amounts',async()=>{
 const archive=fs.readFileSync('migrations/111_archived_schedules.sql','utf8');
 const start=setup.indexOf(archive);
 assert.ok(start>0,'setup.sql includes migration 111');
 const upgraded=await db(setup.slice(0,start));
 try{await upgraded.exec(archive);await upgraded.exec(archive);}finally{await upgraded.close();}
 const d=await db(setup);
 try{
  await signIn(d);
  await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES($1,$2,'Rent','Rent expense','USD',500,'2026-01-01','Monthly')",[id(70),id(1)]);
  await d.query("INSERT INTO expense_plans(id,user_id,name,category,currency,amount,start_date) VALUES($1,$2,'Groceries','Groceries','USD',300,'2026-01-01')",[id(71),id(1)]);
  assert.deepEqual((await d.query('SELECT archived FROM finance_records WHERE id=$1',[id(70)])).rows,[{archived:false}]);
  await d.query('UPDATE finance_records SET archived=true WHERE id=$1',[id(70)]);
  await d.query('UPDATE expense_plans SET archived=true WHERE id=$1',[id(71)]);
  assert.deepEqual((await d.query('SELECT archived,amount::float AS amount FROM finance_records WHERE id=$1',[id(70)])).rows,[{archived:true,amount:500}]);
  assert.equal((await d.query("SELECT (public.expense_plan_month('2026-10-01')->0->>'archived')::boolean AS archived")).rows[0].archived,true,'plans read with their archived flag');
 }finally{await d.close();}
});

test('migration 112 adds later payments to a recorded occurrence: they add up, retries are no-ops, and nothing is added before the first',async()=>{
 const extra=fs.readFileSync('migrations/112_extra_scheduled_payments.sql','utf8');
 assert.ok(setup.includes(extra),'setup.sql includes migration 112');
 const upgraded=await db(setup.slice(0,setup.indexOf(extra)));
 try{await upgraded.exec(extra);await upgraded.exec(extra);}finally{await upgraded.close();}
 const d=await db(setup);
 try{
  await signIn(d);
  const {month}=(await d.query("SELECT date_trunc('month',(now() AT TIME ZONE 'Asia/Tashkent')::date)::date::text AS month")).rows[0];
  await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,opened_on) VALUES($1,$2,'Cash','Cash','USD',1000,$3,$3)",[id(80),id(1),month]);
  await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES($1,$2,'Freelancing','Other income','USD',6000,$3,'Monthly')",[id(81),id(1),month]);
  const cash=async()=>Number((await d.query('SELECT amount FROM finance_records WHERE id=$1',[id(80)])).rows[0].amount);
  const more=(n,amount,extra={})=>d.query('SELECT record_occurrence_extra($1)',[{id:id(n),account_id:id(80),target_id:id(81),date:month,amount,notes:'',...extra}]);
  await assert.rejects(more(82,300),/Record the scheduled payment first/);
  await d.query('SELECT planning_action_with_actual_amount($1,$2)',['occurrence',{id:id(83),account_id:id(80),target_id:id(81),date:month,amount:700,notes:''}]);
  await more(84,800);
  await more(84,800);
  await assert.rejects(more(85,0),/Check the account fields/,'a later payment is more than 0');
  const rows=(await d.query('SELECT amount::float AS amount,occurrence_record_id,occurrence_due_on::text AS due FROM finance_records WHERE id IN ($1,$2) ORDER BY amount',[id(83),id(84)])).rows;
  // Since migration 119 the first payment names its schedule and due date too.
  assert.deepEqual(rows,[{amount:700,occurrence_record_id:id(81),due:month},{amount:800,occurrence_record_id:id(81),due:month}]);
  assert.equal(await cash(),2500,'both payments reach the account, the retry only once');
  await assert.rejects(more(84,900),/already saved with different details/);
  await d.exec(`SET request.jwt.claim.sub='${id(2)}';`);
  await assert.rejects(more(86,100),/Record not found/);
 }finally{await d.close();}
});
