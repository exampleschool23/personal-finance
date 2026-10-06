import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`71000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/117_money_lent_start_date.sql','utf8');
async function db(sql){const d=new PGlite();await d.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}');`);await d.exec(sql);return d;}
const today=async d=>(await d.query("SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS day")).rows[0].day;
const shift=async(d,days)=>(await d.query(`SELECT ((now() AT TIME ZONE 'Asia/Tashkent')::date+${days})::text AS day`)).rows[0].day;
const baseline=async(d,n)=>(await d.query("SELECT occurred_on::text AS day FROM investment_history WHERE record_id=$1 AND event_type='baseline'",[id(n)])).rows[0]?.day;
const lend=(d,n,lent)=>d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,lent_date) VALUES($1,$2,'Izzat','Money lent','UZS',3990000,NULL,$3)",[id(n),id(1),lent]);

test('migration 117 is in setup.sql and safe to re-run',async()=>{
 assert.ok(setup.includes(migration),'setup.sql includes migration 117');
 const d=await db(setup.slice(0,setup.indexOf(migration)));
 try{await d.exec(migration);await d.exec(migration);}finally{await d.close();}
});

test('money lent in the past starts on its lent date, not the day it was entered',async()=>{
 const d=await db(setup);
 try{
  const august=await shift(d,-46);
  await lend(d,10,august);
  assert.equal(await baseline(d,10),august);
  // Fixing the lent date moves the start with it.
  const earlier=await shift(d,-60);
  await d.query('UPDATE finance_records SET lent_date=$1 WHERE id=$2',[earlier,id(10)]);
  assert.equal(await baseline(d,10),earlier);
 }finally{await d.close();}
});

test('a future lent date, or one after later tracker events, leaves the start alone',async()=>{
 const d=await db(setup);
 try{
  const now=await today(d);
  await lend(d,20,await shift(d,5));
  assert.equal(await baseline(d,20),now,'a future date is never used');
  await lend(d,30,await shift(d,-30));
  await d.query("INSERT INTO investment_history(user_id,record_id,event_type,occurred_on,balance,ownership_percentage) VALUES($1,$2,'valuation',$3,4000000,100)",[id(1),id(30),await shift(d,-20)]);
  await d.query('UPDATE finance_records SET lent_date=$1 WHERE id=$2',[await shift(d,-10),id(30)]);
  assert.equal(await baseline(d,30),await shift(d,-30),'the start stays before every later event');
 }finally{await d.close();}
});

test('existing money lent entered after the loan is moved back to its lent date',async()=>{
 const d=await db(setup.slice(0,setup.indexOf(migration)));
 try{
  const august=await shift(d,-46);
  await lend(d,40,august);
  assert.equal(await baseline(d,40),await today(d),'before 117 the start was the day it was entered');
  await d.exec(migration);
  assert.equal(await baseline(d,40),august);
 }finally{await d.close();}
});
