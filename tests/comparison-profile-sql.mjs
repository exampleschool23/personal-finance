import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('first-use date and frozen capital survive visits, retries and preference changes with owner RLS',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}'),('${other}');`);
  // Exercise the sequential migration on a database that already has a real record.
  const setup=fs.readFileSync('database/setup.sql','utf8');const migration=fs.readFileSync('migrations/016_investment_comparison.sql','utf8');await db.exec(setup.slice(0,setup.indexOf(migration)));
  await db.exec(`INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,created_at) VALUES('20000000-0000-4000-8000-000000000001','${owner}','Café','Business','USD',100,'2000-01-01','2026-09-01T01:00:00Z');`);
  await db.exec(migration);
  await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${owner}';`);
  const initial=(await db.query('SELECT mark_app_started() AS value')).rows[0].value;
  assert.equal(initial.source,'earliest_record');assert.ok(initial.started_at.startsWith('2026-09-01'));assert.deepEqual((await db.query('SELECT mark_app_started() AS value')).rows[0].value,initial);
  await db.query('INSERT INTO investment_comparison_baselines(user_id,starting_amount,currency,holdings) VALUES($1,1000,\'USD\',\'[]\')',[owner]);
  await db.query('INSERT INTO investment_comparison_baselines(user_id,starting_amount,currency,holdings) VALUES($1,9999,\'EUR\',\'[]\') ON CONFLICT(user_id) DO NOTHING',[owner]);
  assert.equal(Number((await db.query('SELECT starting_amount FROM investment_comparison_baselines')).rows[0].starting_amount),1000);
  await assert.rejects(db.query('UPDATE investment_comparison_baselines SET starting_amount=9999'),/permission denied/);
  await assert.rejects(db.query("UPDATE user_app_activity SET started_at='2000-01-01'"),/permission denied/);
  await db.query('INSERT INTO investment_comparison_preferences(user_id,benchmarks,custom_symbol) VALUES($1,\'["BTC"]\',\'\')',[owner]);
  await db.query('INSERT INTO investment_comparison_preferences(user_id,benchmarks,custom_symbol) VALUES($1,\'["SPY"]\',\'\') ON CONFLICT(user_id) DO UPDATE SET benchmarks=EXCLUDED.benchmarks,custom_symbol=EXCLUDED.custom_symbol',[owner]);
  assert.deepEqual((await db.query('SELECT benchmarks FROM investment_comparison_preferences')).rows[0].benchmarks,['SPY']);
  await db.exec(`SET request.jwt.claim.sub='${other}';`);assert.equal((await db.query('SELECT * FROM investment_comparison_baselines')).rows.length,0);assert.equal((await db.query('SELECT * FROM user_app_activity')).rows.length,0);
  const fresh=(await db.query('SELECT mark_app_started() AS value')).rows[0].value;assert.equal(fresh.source,'first_visit');
  await assert.rejects(db.query('INSERT INTO investment_comparison_baselines(user_id,starting_amount,currency,holdings) VALUES($1,1000,\'USD\',\'[]\')',[owner]),/row-level security/);
 }finally{await db.close();}
});
