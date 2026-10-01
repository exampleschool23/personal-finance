import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const id=n=>`f0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('treasury bills are tracked interest holdings with a purchase date, listing, dismissible maturity and owner isolation',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);
  await db.exec(fs.readFileSync('database/setup.sql','utf8'));
  const day=(await db.query("SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS day")).rows[0].day;
  const past=(await db.query("SELECT ((now() AT TIME ZONE 'Asia/Tashkent')::date-10)::text AS day")).rows[0].day;
  // The purchase date is accepted as an opening balance date; a future one is not.
  await db.exec(`INSERT INTO finance_records(id,user_id,name,kind,currency,amount,rate,date,opened_on,deposit_compounding) VALUES('${id(10)}','${id(1)}','6-month bill','Treasury bill','USD',4000,4.3,'${past}','${past}','none'),('${id(11)}','${id(1)}','Cash','Cash','USD',5000,0,'2026-09-01',NULL,'monthly');`);
  await assert.rejects(db.exec(`INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,opened_on) VALUES('${id(12)}','${id(1)}','Later','Treasury bill','USD',1,'2030-01-01','2999-01-01')`),/opening balance date/);
  await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${id(1)}';`);
  const amount=async n=>Number((await db.query('SELECT amount FROM finance_records WHERE id=$1',[id(n)])).rows[0].amount);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM investment_history WHERE record_id=$1 AND event_type='baseline'",[id(10)])).rows[0].n,1,'the opening balance is captured');
  await db.query('SELECT record_investment_event($1,$2,$3,$4,$5,$6,$7)',[id(20),id(10),'valuation',day,0,4050,'']);
  assert.equal(await amount(10),4050);
  await db.query('SELECT record_investment_event($1,$2,$3,$4,$5,$6,$7)',[id(21),id(10),'income',day,43,null,'Interest']);
  // Buying more with cash moves money out of the cash account.
  await db.query('SELECT record_investment_with_account($1,$2,$3,$4,$5,$6,$7,$8)',[id(22),id(10),'contribution',day,1000,5050,'Buy',id(11)]);
  assert.equal(await amount(10),5050);assert.equal(await amount(11),4000);
  const page=(await db.query("SELECT finance_records_page(1,'assets',NULL,true) AS page")).rows[0].page;
  assert.ok(page.records.some(row=>row.kind==='Treasury bill'));
  // The maturity reminder can be dismissed like a deposit's, only on its maturity date.
  await assert.rejects(db.query('SELECT planning_action_with_actual_amount($1,$2)',['dismiss',{id:id(30),account_id:id(11),target_id:id(10),date:day,amount:0,notes:''}]),/maturity/);
  await db.query('SELECT planning_action_with_actual_amount($1,$2)',['dismiss',{id:id(31),account_id:id(11),target_id:id(10),date:past,amount:0,notes:''}]);
  assert.equal((await db.query("SELECT status FROM payment_occurrences WHERE record_id=$1",[id(10)])).rows[0].status,'dismissed');
  await db.exec(`SET request.jwt.claim.sub='${id(2)}';`);
  assert.equal((await db.query("SELECT finance_records_page(1,'assets',NULL,false) AS page")).rows[0].page.total,0);
  await assert.rejects(db.query('SELECT record_investment_event($1,$2,$3,$4,$5,$6,$7)',[id(40),id(10),'valuation',day,0,1,'']),/Investment not found/);
 }finally{await db.close();}
});
