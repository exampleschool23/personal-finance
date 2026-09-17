import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {historyCashDelta} from '../lib/investment-history.ts';

test('cash directions match borrowing, lending, repayment and investment actions',()=>{
 for(const kind of ['Debt','Loan','Mortgage']){
  assert.equal(historyCashDelta(kind,'contribution',80),80);
  assert.equal(historyCashDelta(kind,'withdrawal',80),-80);
 }
 for(const kind of ['Money lent','Deposit','Stock','Crypto','Business','Property']){
  assert.equal(historyCashDelta(kind,'contribution',80),-80);
  assert.equal(historyCashDelta(kind,'withdrawal',80),80);
  assert.equal(historyCashDelta(kind,'income',80),80);
  assert.equal(historyCashDelta(kind,'expense',80),-80);
 }
 assert.equal(historyCashDelta('Cash','valuation',80),0);
});

test('lending and cash balances move atomically, with owner/currency/funds checks and safe retries',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
 const id=n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const migration=fs.readFileSync('migrations/029_lending_cash_accounts.sql','utf8');
 const setup=fs.readFileSync('database/setup.sql','utf8');assert.ok(setup.includes(migration));
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}'),('${other}');`);
  await db.exec(setup.slice(0,setup.indexOf(migration)));
  const add=(n,kind,amount,currency='UZS',user=owner)=>db.query('INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date) VALUES($1,$2,$3,$3,$4,$5,CURRENT_DATE)',[id(n),user,kind,currency,amount]);
  await add(1,'Debt',140000000);await add(2,'Cash',100000000);
  await add(3,'Loan',1000);await add(4,'Money lent',1000);await add(5,'Mortgage',1000);
  await add(6,'Cash',1);await add(7,'Cash',1000,'USD');await add(8,'Cash',1000,'UZS',other);await add(9,'Deposit',1000);
  const before=(await db.query('SELECT * FROM investment_history ORDER BY id')).rows;
  await db.exec(migration);assert.deepEqual((await db.query('SELECT * FROM investment_history ORDER BY id')).rows,before);
  await db.exec(`CREATE FUNCTION reject_test_link() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.id='${id(151)}' THEN RAISE EXCEPTION 'Simulated account link failure'; END IF; RETURN NEW; END$$;CREATE TRIGGER reject_test_link BEFORE INSERT ON investment_account_links FOR EACH ROW EXECUTE FUNCTION reject_test_link();`);
  await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${owner}';`);
  const today=(await db.query("SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS day")).rows[0].day;
  const save=(n,record,type,amount,account=2,date=today,balance=null,notes='')=>db.query('SELECT record_investment_with_account($1,$2,$3,$4,$5,$6,$7,$8)',[id(n),id(record),type,date,amount,balance,notes,id(account)]);
  const balance=async n=>Number((await db.query('SELECT amount FROM finance_records WHERE id=$1',[id(n)])).rows[0].amount);
  await save(100,1,'withdrawal',80000000);
  assert.equal(await balance(1),60000000);assert.equal(await balance(2),20000000);
  const link=(await db.query('SELECT * FROM investment_account_links WHERE id=$1',[id(100)])).rows[0];
  assert.equal(link.account_id,id(2));assert.equal(Number(link.amount),-80000000);
  const cashHistory=(await db.query('SELECT *,occurred_on::text AS day FROM investment_history WHERE record_id=$1 ORDER BY created_at',[id(2)])).rows;
  assert.equal(cashHistory.length,2);assert.equal(cashHistory[1].event_type,'withdrawal');assert.equal(Number(cashHistory[1].balance),20000000);
  assert.equal(Number(cashHistory[1].amount),80000000);assert.equal(cashHistory[1].day,today);
  // Retry succeeds even though the account can no longer afford another payment.
  await save(100,1,'withdrawal',80000000);assert.equal(await balance(2),20000000);
  await assert.rejects(save(100,1,'withdrawal',80000000,6),/different details/);
  await assert.rejects(save(100,1,'withdrawal',79000000),/different details/);
  await assert.rejects(save(100,1,'withdrawal',80000000,2,today,null,'changed'),/different details/);
  for(const account of [7,8,9,1])await assert.rejects(save(101,1,'withdrawal',10,account),/record currency/);
  await assert.rejects(save(101,1,'withdrawal',30000000),/Not enough money/);
  await assert.rejects(save(101,1,'withdrawal',60000001),/Not enough money/);
  await assert.rejects(save(101,1,'contribution',1,2,'2000-01-01'),/latest cash balance date/);
  await assert.rejects(save(101,1,'expense',1),/not available/);
  assert.equal(await balance(1),60000000);assert.equal(await balance(2),20000000);
  assert.equal((await db.query('SELECT * FROM investment_history WHERE id=$1',[id(101)])).rows.length,0);
  await save(102,1,'contribution',50000000);assert.equal(await balance(1),110000000);assert.equal(await balance(2),70000000);
  // Loan cash direction is opposite to money lent. Fractional inputs stay precise.
  for(const [record,direction] of [[3,1],[4,-1],[5,1]]){
   const prior=await balance(2);await save(110+record,record,'contribution',100.25);
   assert.equal(await balance(record),1100.25);assert.equal(await balance(2),prior+direction*100.25);
   if(record!==5){await save(120+record,record,'withdrawal',50.25);assert.equal(await balance(record),1050);assert.equal(await balance(2),prior+direction*50);}
  }
  await assert.rejects(save(130,3,'withdrawal',2000),/cannot exceed/);
  await assert.rejects(save(130,4,'contribution',2,6),/Not enough money/);
  await assert.rejects(save(130,5,'withdrawal',10),/Record payment/);
  assert.equal(Number((await db.query('SELECT count(*) FROM finance_records')).rows[0].count),8); // Other owner's record is hidden.
  const beforePayoff=await balance(2);await save(131,3,'withdrawal',1050);
  assert.equal(await balance(3),0);assert.equal(await balance(2),beforePayoff-1050);
  // Force a failure after both balance updates: the entire transaction rolls back.
  const historyCount=Number((await db.query('SELECT count(*) FROM investment_history')).rows[0].count);
  const beforeFailure=await balance(2);
  await assert.rejects(save(151,1,'withdrawal',100),/Simulated account link failure/);
  assert.equal(await balance(1),110000000);assert.equal(await balance(2),beforeFailure);
  assert.equal(Number((await db.query('SELECT count(*) FROM investment_history')).rows[0].count),historyCount);
  // A legacy balance-only event must never be retroactively charged on retry.
  await db.query('SELECT record_investment_event($1,$2,$3,$4,$5,$6,$7)',[id(140),id(3),'contribution',today,1,null,'']);
  await assert.rejects(save(140,3,'contribution',1),/already saved without an account/);
  // Existing investment income still updates its linked account exactly once.
  const priorCash=await balance(2);await save(150,9,'income',25);await save(150,9,'income',25);
  assert.equal(await balance(2),priorCash+25);assert.equal(await balance(9),1000);
  await db.exec(`SET request.jwt.claim.sub='${other}';`);
  await assert.rejects(save(160,1,'withdrawal',10,8),/record currency/);
  assert.equal((await db.query('SELECT * FROM investment_account_links')).rows.length,0);
 }finally{await db.close();}
});
