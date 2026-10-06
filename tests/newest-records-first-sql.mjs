import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`72000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/118_newest_records_first.sql','utf8');
async function db(sql){const d=new PGlite();await d.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}');`);await d.exec(sql);return d;}

test('migration 118 is in setup.sql and safe to re-run',async()=>{
 assert.ok(setup.includes(migration),'setup.sql includes migration 118');
 const d=await db(setup.slice(0,setup.indexOf(migration)));
 try{await d.exec(migration);await d.exec(migration);}finally{await d.close();}
});

test('rows saved on the same day come back newest first, whatever their ids',async()=>{
 const d=await db(setup);
 try{
  // Neither id order matches the save order, so an id tie-break (either direction) fails the checks below.
  const rows=[[9,'QA first','2026-10-06 08:00+05'],[1,'QA second','2026-10-06 12:00+05'],[5,'QA newest','2026-10-06 17:40+05']];
  for(const [n,name,saved] of rows) await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,created_at) VALUES($1,$2,$3,'Other expense','USD',10,'2026-10-06',$4)",[id(n),id(1),name,saved]);
  await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,created_at) VALUES($1,$2,'QA yesterday','Other expense','USD',10,'2026-10-05','2026-10-06 18:00+05')",[id(20),id(1)]);
  await d.exec(`SET request.jwt.claim.sub='${id(1)}';SET ROLE authenticated;`);
  const page=(await d.query("SELECT public.finance_records_page(1,'cashflow',NULL,false) AS page")).rows[0].page;
  assert.deepEqual(page.records.map(r=>r.name),['QA newest','QA second','QA first','QA yesterday']);
  // Cash flow reads the transaction history, which orders the same way.
  const history=(await d.query("SELECT public.transaction_history_page(1,NULL,'','all',NULL,NULL,'newest') AS page")).rows[0].page;
  assert.deepEqual(history.records.map(r=>r.name),['QA newest','QA second','QA first','QA yesterday']);
  const oldest=(await d.query("SELECT public.transaction_history_page(1,NULL,'','all',NULL,NULL,'oldest') AS page")).rows[0].page;
  assert.deepEqual(oldest.records.map(r=>r.name),['QA yesterday','QA first','QA second','QA newest']);
 }finally{await d.close();}
});

test('changing the category renames a transaction that was named after its old category, never a typed name',async()=>{
 const d=await db(setup);
 try{
  await d.query("INSERT INTO transaction_categories(id,user_id,name,direction) VALUES($1,$2,'QA Transport','expense')",[id(50),id(1)]);
  await d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date) VALUES($1,$2,'Other expense','Other expense','USD',64.99,'2026-10-06'),($3,$2,'QA Taxi home','Other expense','USD',12,'2026-10-06')",[id(60),id(1),id(61)]);
  await d.exec(`SET request.jwt.claim.sub='${id(1)}';SET ROLE authenticated;`);
  const names=async()=>(await d.query('SELECT name FROM finance_records WHERE id IN($1,$2) ORDER BY id',[id(60),id(61)])).rows.map(r=>r.name);
  await d.query("SELECT public.set_transaction_category($1,'Other expense',$2)",[[id(60),id(61)],id(50)]);
  assert.deepEqual(await names(),['QA Transport','QA Taxi home']);
  await d.query("SELECT public.set_transaction_category($1,'Living expense',NULL)",[[id(60),id(61)]]);
  assert.deepEqual(await names(),['Living expense','QA Taxi home']);
 }finally{await d.close();}
});
