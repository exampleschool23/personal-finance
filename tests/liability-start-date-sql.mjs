import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`72000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/123_liability_start_date_editable.sql','utf8');
async function db(sql){const d=new PGlite();await d.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}');`);await d.exec(sql);return d;}
const shift=async(d,days)=>(await d.query(`SELECT ((now() AT TIME ZONE 'Asia/Tashkent')::date+${days})::text AS day`)).rows[0].day;
const baseline=async(d,n)=>(await d.query("SELECT occurred_on::text AS day FROM investment_history WHERE record_id=$1 AND event_type='baseline'",[id(n)])).rows[0]?.day;
const mortgage=(d,n,opened)=>d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,opened_on,estimated_monthly_payment) VALUES($1,$2,'Home','Mortgage','USD',86531,'2032-05-05',$3,1600)",[id(n),id(1),opened]);
const start=(d,n,day)=>d.query('UPDATE finance_records SET opened_on=$1 WHERE id=$2',[day,id(n)]);
const refused=async(promise,message)=>assert.match(await promise.then(()=>'saved',error=>error.message),message);

test('migration 123 is in setup.sql and safe to re-run',async()=>{
 assert.ok(setup.includes(migration),'setup.sql includes migration 123');
 const d=await db(setup.slice(0,setup.indexOf(migration)));
 try{await d.exec(migration);await d.exec(migration);}finally{await d.close();}
});

test('a mortgage saved without a start date can be given one, and a wrong one corrected; its baseline follows',async()=>{
 const d=await db(setup);
 try{
  await mortgage(d,10,null);
  const may=await shift(d,-150);
  await start(d,10,may);
  assert.equal(await baseline(d,10),may);
  const earlier=await shift(d,-400);
  await start(d,10,earlier);
  assert.equal(await baseline(d,10),earlier);
  await refused(start(d,10,null),/The start date cannot change after creation\./);
  await refused(start(d,10,await shift(d,3)),/Check the opening balance date\./);
 }finally{await d.close();}
});

test('the start date cannot move past a recorded payment',async()=>{
 const d=await db(setup);
 try{
  await mortgage(d,20,await shift(d,-200));
  await d.query("INSERT INTO mortgage_payments(id,user_id,mortgage_id,principal,interest,paid_on) VALUES($1,$2,$3,469,1105,$4)",[id(21),id(1),id(20),await shift(d,-30)]);
  await refused(start(d,20,await shift(d,-10)),/The start date cannot be after a recorded payment\./);
  await start(d,20,await shift(d,-60));
  assert.equal((await d.query('SELECT opened_on::text AS day FROM finance_records WHERE id=$1',[id(20)])).rows[0].day,await shift(d,-60));
 }finally{await d.close();}
});

test('opening dates of cash and holdings stay fixed',async()=>{
 const d=await db(setup);
 try{
  await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,opened_on) VALUES($1,$2,'Wallet','Cash','USD',10,$3,$3)",[id(30),id(1),await shift(d,-20)]);
  await refused(start(d,30,await shift(d,-40)),/The opening balance date cannot change after creation\./);
 }finally{await d.close();}
});
