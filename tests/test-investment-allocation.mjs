import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {investmentMarketSnapshot,renderInvestmentSql} from '../scripts/create-test-investment-sql.mjs';
import {depositToday} from '../lib/deposit-interest.ts';
const target='84cae6f3-0494-4aa8-ab5a-5f673dfdae61',source='60e06991-ac41-4df9-a09b-7ca9619b8b25';
const day=depositToday();
const market={rates:{USD:1,UZS:13000,EUR:.9123456},ratesDate:day,fx:{rate:12345.67,date:day,source:'CBU'},quotes:Object.fromEntries([['Crypto:BTC',63854.42],['Crypto:ETH',2690.64],['Stock:SPY',567.64]].map(([key,usd])=>[key,{usd,source:'Fixture',fetchedAt:day+'T10:00:00Z'}]))};
test('retrieved rates preserve provider dates, identity and nominal UZS override; missing/stale quotes fail closed',()=>{
 const snapshot=investmentMarketSnapshot(market,day);
 assert.equal(snapshot.rates.UZS.rate,12345.67);assert.equal(snapshot.rates.EUR.rate,.9123456);assert.equal(snapshot.rates.USD.rate,1);
 assert.throws(()=>investmentMarketSnapshot({...market,ratesDate:'2020-01-01'},day),/unavailable/);
 assert.throws(()=>investmentMarketSnapshot({...market,quotes:{}},day),/BTC/);
 assert.throws(()=>investmentMarketSnapshot({...market,fx:{...market.fx,rate:0}},day),/invalid/);
});
test('sample investments spend existing cash once, convert currencies, preserve ownership, history and total value',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${target}','hoggish@gmail.com'),('${source}','owner@example.com');`);
  await db.exec(fs.readFileSync('database/setup.sql','utf8'));
  await db.query("INSERT INTO user_preferences(user_id,language,currencies) VALUES($1,'en',ARRAY['USD','UZS','EUR'])",[source]);
  for(const [name,kind,currency,amount,share] of [['Reference cafe','Business','UZS',1000000000,30],['Reference studio','Business','USD',70000,50],['Salary','Salary','USD',4000,100],['Euro cash','Cash','EUR',1000,100]]){
   await db.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,ownership_percentage,estimated_monthly_income,date) VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,100,'2020-01-01')",[source,name,kind,currency,amount,share]);
  }
  await db.exec(fs.readFileSync('scripts/seed-test-account.sql','utf8'));
  const snapshot=investmentMarketSnapshot(market,day),sql=renderInvestmentSql(snapshot);
  const state=async owner=>JSON.stringify((await db.query('SELECT * FROM finance_records WHERE user_id=$1 ORDER BY id',[owner])).rows);
  const before=await state(target),sourceBefore=await state(source);
  const historyBefore=(await db.query('SELECT * FROM investment_history WHERE user_id=$1 ORDER BY id',[target])).rows;
  const cashBefore=(await db.query("SELECT id,amount FROM finance_records WHERE user_id=$1 AND kind='Cash'",[target])).rows;
  // Missing any held currency aborts before changing the account.
  const missing=structuredClone(snapshot);delete missing.rates.EUR;
  await assert.rejects(db.exec(renderInvestmentSql(missing)),/no retrieved exchange rate/);await db.exec('ROLLBACK');assert.equal(await state(target),before);
  // A failure during a purchase rolls back earlier FX and business funding as well.
  await db.exec(`CREATE FUNCTION fail_test_purchase() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.user_id='${target}' AND NEW.kind='buy' THEN RAISE EXCEPTION 'simulated purchase failure'; END IF;RETURN NEW;END$$;CREATE TRIGGER fail_test_purchase BEFORE INSERT ON asset_movements FOR EACH ROW EXECUTE FUNCTION fail_test_purchase();`);
  await assert.rejects(db.exec(sql),/simulated purchase failure/);await db.exec('ROLLBACK');assert.equal(await state(target),before);
  await db.exec('DROP TRIGGER fail_test_purchase ON asset_movements');
  await db.exec(sql);
  assert.equal(await state(source),sourceBefore);
  assert.deepEqual((await db.query('SELECT * FROM investment_history WHERE id=ANY($1::uuid[]) ORDER BY id',[historyBefore.map(row=>row.id)])).rows,historyBefore);
  for(const row of cashBefore){
   const after=Number((await db.query('SELECT amount FROM finance_records WHERE id=$1',[row.id])).rows[0].amount),beforeAmount=Number(row.amount);
   assert.ok(Math.abs(after-(beforeAmount-Math.floor(beforeAmount*.6)-2*Math.floor(beforeAmount*.15)))<.0000001);
  }
  const holdings=(await db.query("SELECT * FROM finance_records WHERE user_id=$1 AND import_key LIKE 'sample-investment-allocation-v1%'",[target])).rows;
  for(const symbol of ['BTC','ETH','SPY'])assert.ok(Number(holdings.find(row=>row.name===symbol).quantity)>0);
  assert.deepEqual(holdings.filter(row=>row.kind==='Business').map(row=>Number(row.ownership_percentage)).sort(),[30,50]);
  assert.ok(holdings.filter(row=>row.kind==='Business').every(row=>Number(row.amount)>0));
  const cashSettlement=holdings.find(row=>row.import_key.endsWith(':settlement'));assert.ok(Math.abs(Number(cashSettlement.amount))<.000000001);
  const movements=(await db.query("SELECT * FROM asset_movements WHERE user_id=$1 AND notes LIKE '%sample-investment-allocation-v1%'",[target])).rows;
  assert.equal(movements.filter(row=>row.kind==='buy').length,cashBefore.length*3);
  assert.equal(Number(movements.find(row=>row.kind==='transfer'&&Number(row.exchange_rate)===1).exchange_rate),1);
  assert.ok(movements.some(row=>row.kind==='transfer'&&Number(row.exchange_rate)===1/12345.67));
  const after=await state(target);
  await assert.rejects(db.exec(sql),/already applied/);await db.exec('ROLLBACK');assert.equal(await state(target),after);
  await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${target}';`);
  assert.equal((await db.query('SELECT count(*)::int n FROM finance_records WHERE user_id=$1',[source])).rows[0].n,0);
 }finally{await db.close();}
});
