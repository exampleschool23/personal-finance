import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('tracker SQL preserves history, scopes owners and records rental cash atomically', {skip:!process.env.PGLITE_MODULE}, async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
 const asset='20000000-0000-4000-8000-000000000001',mortgage='20000000-0000-4000-8000-000000000002';
 const id=n=>`30000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}'),('${other}');`);
  await db.exec(fs.readFileSync('database/setup.sql','utf8'));
  await db.exec(`INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date) VALUES('${asset}','${owner}','Rental','Property','USD',100000,'2020-01-01'),('${mortgage}','${owner}','Mortgage','Mortgage','USD',70000,'2030-01-01');SET ROLE authenticated;SET request.jwt.claim.sub='${owner}';`);
  const today=(await db.query("SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS day")).rows[0].day;
  const save=(n,type,amount,balance,date=today,record=asset)=>db.query('SELECT record_investment_event($1,$2,$3,$4,$5,$6,$7)',[id(n),record,type,date,amount,balance,'']);
  const value=async()=>Number((await db.query('SELECT amount FROM finance_records WHERE id=$1',[asset])).rows[0].amount);
  await save(1,'valuation',0,120000);assert.equal(await value(),120000);
  await save(2,'valuation',0,80000,'2020-01-01');assert.equal(await value(),120000);
  await save(3,'income',450,null);await save(3,'income',450,null);
  const rent=(await db.query('SELECT * FROM finance_records WHERE history_event_id=$1',[id(3)])).rows;
  assert.equal(rent.length,1);assert.equal(rent[0].kind,'Rent income');assert.equal(rent[0].frequency,'Once');assert.equal(Number(rent[0].amount),450);
  await assert.rejects(save(3,'income',500,null),/different details/);
  await assert.rejects(save(4,'income',0,null),/Check the tracker/);
  await assert.rejects(save(4,'valuation',0,130000,'2999-01-01'),/Check the tracker/);
  await assert.rejects(db.query('UPDATE finance_records SET amount=1 WHERE id=$1',[id(3)]),/cannot be edited/);
  await assert.rejects(db.query('DELETE FROM investment_history'),/permission denied/);
  await assert.rejects(db.query("UPDATE finance_records SET currency='UZS' WHERE id=$1",[asset]),/keep their category/);
  // Colliding ledger id forces a failure after event insertion: whole transaction rolls back.
  await db.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date) VALUES($1,$2,'Existing','Salary','USD',1,$3)",[id(9),owner,today]);
  await assert.rejects(save(9,'income',100,null),/duplicate key/);
  assert.equal((await db.query('SELECT * FROM investment_history WHERE id=$1',[id(9)])).rows.length,0);
  await db.query('SELECT record_mortgage_payment($1,$2,$3,$4,$5,$6)',[id(10),mortgage,500,100,today,'']);
  const payment=(await db.query('SELECT * FROM investment_history WHERE id=$1',[id(10)])).rows[0];
  assert.equal(Number(payment.principal),500);assert.equal(Number(payment.interest),100);assert.equal(Number(payment.balance),69500);
  await db.exec(`SET request.jwt.claim.sub='${other}';`);
  assert.equal((await db.query('SELECT * FROM investment_history')).rows.length,0);
  await assert.rejects(save(11,'valuation',0,1),/Investment not found/);
 }finally{await db.close();}
});
