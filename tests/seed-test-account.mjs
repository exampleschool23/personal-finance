import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const target='84cae6f3-0494-4aa8-ab5a-5f673dfdae61';
const source='60e06991-ac41-4df9-a09b-7ca9619b8b25';
const sql=fs.readFileSync('scripts/seed-test-account.sql','utf8');
test('test-account seed is atomic, owner isolated, repeat-safe and reconciles history from 2020',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${target}','wrong@example.com'),('${source}','owner@example.com');`);
  await db.exec(fs.readFileSync('database/setup.sql','utf8'));
  await db.query("INSERT INTO user_preferences(user_id,language,currencies) VALUES($1,'uz',ARRAY['UZS','USD','EUR'])",[source]);
  for(const [kind,amount,quantity,currency] of [['Cash',.01,1,'CHF'],['Cash',5000,1,'USD'],['Salary',21000000,1,'UZS'],['Stock',125.12345678,3.125,'USD'],['Crypto',.00000017,12345.6789,'USD'],['Deposit',100000000,1,'UZS'],['Business',40000,1,'USD'],['Property',60000,1,'USD'],['Money lent',2000,1,'USD'],['Mortgage',20000,1,'USD'],['Loan',1234.56789,1,'EUR'],['Debt',1000,1,'USD']]){
   await db.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,quantity,date,rate,ownership_percentage) VALUES(gen_random_uuid(),$1,$2,$2,$3,$4,$5,'2025-01-01',12,$6)",[source,kind,currency,amount,quantity,kind==='Business'?35:100]);
  }
  const sourceState=async()=>JSON.stringify((await db.query('SELECT to_jsonb(f) AS data FROM finance_records f WHERE user_id=$1 ORDER BY id',[source])).rows);
  const before=await sourceState();
  await assert.rejects(db.exec(sql),/Test UID must belong/);await db.exec('ROLLBACK');
  assert.equal((await db.query('SELECT count(*)::int n FROM finance_records WHERE user_id=$1',[target])).rows[0].n,0);
  await db.query("UPDATE auth.users SET email='hoggish@gmail.com' WHERE id=$1",[target]);
  // Failure after data generation has begun must roll back all inserts and preferences.
  await db.exec(`CREATE FUNCTION fail_test_seed() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.user_id='${target}' AND NEW.kind='Living expense' THEN RAISE EXCEPTION 'simulated failure';END IF;RETURN NEW;END$$;CREATE TRIGGER fail_test_seed BEFORE INSERT ON finance_records FOR EACH ROW EXECUTE FUNCTION fail_test_seed();`);
  await assert.rejects(db.exec(sql),/simulated failure/);await db.exec('ROLLBACK');
  assert.equal((await db.query('SELECT count(*)::int n FROM finance_records WHERE user_id=$1',[target])).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int n FROM user_preferences WHERE user_id=$1',[target])).rows[0].n,0);
  await db.exec('DROP TRIGGER fail_test_seed ON finance_records');
  await db.exec(sql);
  assert.equal(await sourceState(),before);
  const prefs=(await db.query('SELECT * FROM user_preferences WHERE user_id=$1',[target])).rows[0];
  assert.equal(prefs.language,'uz');assert.deepEqual(prefs.currencies,['UZS','CHF','EUR','USD']);
  const history=(await db.query("SELECT min(occurred_on)::text first,max(occurred_on)::text last,count(*)::int n FROM investment_history WHERE user_id=$1",[target])).rows[0];
  assert.equal(history.first,'2020-01-01');assert.ok(history.n>600);
  assert.equal(history.last,(await db.query("SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS day")).rows[0].day);
  assert.equal((await db.query(`SELECT count(*)::int n FROM finance_records f JOIN LATERAL (SELECT balance FROM investment_history WHERE record_id=f.id AND balance IS NOT NULL ORDER BY occurred_on DESC,created_at DESC,id DESC LIMIT 1) h ON true WHERE f.user_id=$1 AND abs(f.amount*CASE WHEN f.kind IN ('Stock','Crypto') THEN f.quantity ELSE 1 END-h.balance)>.000000000001`,[target])).rows[0].n,0);
  // Cash = opening + linked ordinary transactions + tracker account movements, without double counting.
  assert.equal((await db.query(`SELECT count(*)::int n FROM finance_records c WHERE c.user_id=$1 AND c.kind='Cash' AND abs(c.amount-(
   (SELECT balance FROM investment_history WHERE record_id=c.id AND event_type='baseline')+
   coalesce((SELECT sum(CASE WHEN kind IN ('Salary','Rent income','Other income','Business income') THEN amount ELSE -amount END) FROM finance_records WHERE account_id=c.id),0)+
   coalesce((SELECT sum(amount) FROM investment_account_links WHERE account_id=c.id),0)))>.000000001`,[target])).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int n FROM finance_records f JOIN finance_records a ON a.id=f.account_id WHERE f.user_id<>a.user_id')).rows[0].n,0);
  const crypto=(await db.query("SELECT amount,quantity FROM finance_records WHERE user_id=$1 AND kind='Crypto'",[target])).rows[0];
  assert.equal(Number(crypto.amount),.00000017);assert.equal(Number(crypto.quantity),12345.6789);
  const snapshot=JSON.stringify((await db.query('SELECT * FROM finance_records WHERE user_id=$1 ORDER BY id',[target])).rows);
  await assert.rejects(db.exec(sql),/already contains data/);await db.exec('ROLLBACK');
  assert.equal(JSON.stringify((await db.query('SELECT * FROM finance_records WHERE user_id=$1 ORDER BY id',[target])).rows),snapshot);
  await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${target}';`);
  assert.equal((await db.query('SELECT count(*)::int n FROM finance_records WHERE user_id=$1',[source])).rows[0].n,0);
  console.log('Seed fixture verified:',history);
 } finally {await db.close();}
});
