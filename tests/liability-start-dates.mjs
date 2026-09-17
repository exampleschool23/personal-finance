import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('liability start dates anchor opening history and allow delayed entry without changing due dates',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 const owner='10000000-0000-4000-8000-000000000001';
 const id=n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const migration=fs.readFileSync('migrations/030_liability_start_dates.sql','utf8');
 const setup=fs.readFileSync('database/setup.sql','utf8');assert.ok(setup.includes(migration));
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}');`);
  await db.exec(setup.slice(0,setup.indexOf(migration)));
  await db.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date) VALUES($1,$2,'Legacy debt','Debt','UZS',140000000,'2030-01-01')",[id(0),owner]);
  const prior=(await db.query('SELECT * FROM investment_history WHERE record_id=$1',[id(0)])).rows;
  await db.exec(migration);
  assert.deepEqual((await db.query('SELECT * FROM investment_history WHERE record_id=$1',[id(0)])).rows,prior);
  assert.equal((await db.query('SELECT opened_on FROM finance_records WHERE id=$1',[id(0)])).rows[0].opened_on,null);
  await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${owner}';`);
  const insert=(n,kind,start='2020-01-01',due='2030-01-01')=>db.query('INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,opened_on) VALUES($1,$2,$3,$3,$4,140000000,$5,$6)',[id(n),owner,kind,'UZS',due,start]);
  const amount=async n=>Number((await db.query('SELECT amount FROM finance_records WHERE id=$1',[id(n)])).rows[0].amount);
  for(const [i,kind] of ['Debt','Loan','Mortgage'].entries()){
   const n=i+1;await insert(n,kind);
   const dates=(await db.query('SELECT opened_on::text AS start,date::text AS due FROM finance_records WHERE id=$1',[id(n)])).rows[0];
   assert.deepEqual(dates,{start:'2020-01-01',due:'2030-01-01'});
   const history=(await db.query('SELECT event_type,occurred_on::text AS day,balance FROM investment_history WHERE record_id=$1',[id(n)])).rows;
   assert.equal(history.length,1);assert.equal(history[0].event_type,'baseline');assert.equal(history[0].day,'2020-01-01');assert.equal(Number(history[0].balance),140000000);
   await assert.rejects(insert(10,kind,'2020-02-01','2020-01-01'),/start and due dates/);
   await assert.rejects(insert(10,kind,'2999-01-01','2999-02-01'),/opening balance date/);
   await assert.rejects(db.query('UPDATE finance_records SET date=$1 WHERE id=$2',['2019-12-31',id(n)]),/start and due dates/);
   await assert.rejects(db.query('UPDATE finance_records SET opened_on=$1 WHERE id=$2',['2019-12-31',id(n)]),/start date cannot change/);
   // Resaving the same start date (including through an upsert) does not duplicate history.
   await db.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,opened_on) VALUES($1,$2,$3,$3,'UZS',140000000,'2030-02-01','2020-01-01') ON CONFLICT(id) DO UPDATE SET date=excluded.date,opened_on=excluded.opened_on",[id(n),owner,kind]);
   assert.equal((await db.query('SELECT * FROM investment_history WHERE record_id=$1',[id(n)])).rows.length,1);
  }
  await insert(4,'Cash');
  const pay=(n,record,date)=>db.query('SELECT record_investment_with_account($1,$2,$3,$4,$5,$6,$7,$8)',[id(n),id(record),'withdrawal',date,80000000,null,'',id(4)]);
  await assert.rejects(pay(20,1,'2019-12-31'),/latest cash balance date/);
  await pay(20,1,'2020-01-02');assert.equal(await amount(1),60000000);assert.equal(await amount(4),60000000);
  assert.equal((await db.query('SELECT occurred_on::text AS day FROM investment_history WHERE id=$1',[id(20)])).rows[0].day,'2020-01-02');
  const mortgage=(n,date)=>db.query('SELECT record_mortgage_payment($1,$2,$3,$4,$5,$6)',[id(n),id(3),1000000,10000,date,'']);
  await assert.rejects(mortgage(21,'2019-12-31'),/cannot precede the start date/);
  assert.equal(await amount(3),140000000);
  await mortgage(21,'2020-01-02');assert.equal(await amount(3),139000000);
  await db.query('UPDATE finance_records SET notes=$1,opened_on=null WHERE id=$2',['Keep unknown start',id(0)]);
  assert.equal((await db.query('SELECT opened_on FROM finance_records WHERE id=$1',[id(0)])).rows[0].opened_on,null);
  // Existing account opening dates retain the same protection.
  await assert.rejects(db.query('UPDATE finance_records SET opened_on=$1 WHERE id=$2',['2019-12-31',id(4)]),/opening balance date cannot change/);
 }finally{await db.close();}
});
