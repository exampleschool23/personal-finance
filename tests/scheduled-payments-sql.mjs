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
 assert.ok(setup.endsWith(migration),'setup.sql ends with migration 109');
 const d=await db(setup.slice(0,setup.length-migration.length));
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
