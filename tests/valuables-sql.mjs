import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const id=n=>`f0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('valuables are tracked assets with cash-linked updates, deletable corrections, listing and owner isolation',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);
  await db.exec(fs.readFileSync('database/setup.sql','utf8'));
  await assert.rejects(db.exec(`INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date) VALUES('${id(9)}','${id(1)}','Painting','Jewelry','USD',1,'2026-09-01')`),/finance_records_kind_check/);
  await db.exec(`INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date) VALUES('${id(10)}','${id(1)}','Watch','Valuables','USD',8000,'2026-09-01'),('${id(11)}','${id(1)}','Cash','Cash','USD',5000,'2026-09-01');SET ROLE authenticated;SET request.jwt.claim.sub='${id(1)}';`);
  const day=(await db.query("SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS day")).rows[0].day;
  const amount=async n=>Number((await db.query('SELECT amount FROM finance_records WHERE id=$1',[id(n)])).rows[0].amount);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM investment_history WHERE record_id=$1 AND event_type='baseline'",[id(10)])).rows[0].n,1);
  await db.query('SELECT record_investment_event($1,$2,$3,$4,$5,$6,$7)',[id(20),id(10),'valuation',day,0,9000,'']);
  assert.equal(await amount(10),9000);
  // A cash-funded strap upgrade keeps the recorded value unless a valuation is given.
  await db.query('SELECT record_investment_with_account($1,$2,$3,$4,$5,$6,$7,$8)',[id(21),id(10),'contribution',day,500,null,'Strap',id(11)]);
  assert.equal(await amount(10),9000);assert.equal(await amount(11),4500);
  await db.query('SELECT delete_tracker_update($1,$2)',[id(21),id(10)]);
  assert.equal(await amount(11),5000);
  await db.query('SELECT delete_tracker_update($1,$2)',[id(20),id(10)]);
  assert.equal(await amount(10),8000);
  const page=(await db.query("SELECT finance_records_page(1,'assets',NULL,true) AS page")).rows[0].page;
  assert.ok(page.records.some(row=>row.kind==='Valuables'));
  assert.equal(page.summary.filter(row=>row.kind==='Valuables').length,1);
  await db.exec(`SET request.jwt.claim.sub='${id(2)}';`);
  assert.equal((await db.query("SELECT finance_records_page(1,'assets',NULL,false) AS page")).rows[0].page.total,0);
  assert.equal((await db.query('SELECT * FROM investment_history')).rows.length,0);
  await assert.rejects(db.query('SELECT record_investment_event($1,$2,$3,$4,$5,$6,$7)',[id(30),id(10),'valuation',day,0,1,'']),/Investment not found/);
  await assert.rejects(db.query('SELECT delete_tracker_update($1,$2)',[id(20),id(10)]),/not found/);
 }finally{await db.close();}
});
