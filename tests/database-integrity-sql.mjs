import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`12400000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [owner,stranger]=[1,2].map(id);
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/124_database_integrity.sql','utf8');
async function db(sql){const d=new PGlite();await d.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}'),('${stranger}');`);await d.exec(sql);return d;}
const functions=d=>d.query(`SELECT md5(string_agg(pg_get_functiondef(p.oid),'' ORDER BY p.oid::regprocedure::text)) AS sum FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' AND p.proname<>'finance_capabilities'`).then(r=>r.rows[0].sum);
const as=(d,user)=>d.exec(`RESET ROLE;SET request.jwt.claim.sub='${user}';SET request.headers='{}';SET ROLE authenticated;`);

test('migration 124 is in setup.sql and the app requires the newest schema version',()=>{
 assert.ok(setup.includes(migration),'setup.sql includes migration 124');
 const newest=Math.max(...fs.readdirSync('migrations').map(name=>Number(name.slice(0,3))));
 const required=Number(fs.readFileSync('lib/database-capabilities.ts','utf8').match(/requiredSchemaVersion = (\d+)/)[1]);
 assert.equal(required,newest,'each migration the app needs raises requiredSchemaVersion');
 assert.match(setup.slice(setup.lastIndexOf('FUNCTION public.finance_capabilities()')),new RegExp(`'schema_version',${newest},`),'finance_capabilities reports the newest migration');
});

test('text-patching migrations change nothing when applied again',async()=>{
 const d=await db(setup);
 try{
  const before=await functions(d);
  // finance_capabilities is left out: each migration sets its own version, and a later one (128) has moved it on.
  // 133 is left out too: its one-time update reads budget_categories.group_name, which 142 dropped.
  for(const name of ['110_scheduled_payment_date.sql','118_newest_records_first.sql','124_database_integrity.sql','125_repair_recategorize_names.sql','127_category_delete_moves_budget.sql','128_review_integrity.sql','129_telegram_deliveries.sql','130_attachment_files_first.sql','132_income_source_one_id.sql','134_source_ids_and_plan_currency.sql','142_drop_budget_group_name.sql']){
   await d.exec(fs.readFileSync('migrations/'+name,'utf8'));
   assert.equal(await functions(d),before,name+' re-applied leaves every function as it was');
  }
 }finally{await d.close();}
});

test('a privileged save cannot overwrite another owner\'s record, and amounts refuse NaN',async()=>{
 const d=await db(setup);
 try{
  await d.exec(`INSERT INTO telegram_subscriptions(user_id,chat_id,linked_at) VALUES('${stranger}',222,now());`);
  await as(d,owner);
  await d.query(`SELECT public.save_finance_record('{"id":"${id(10)}","name":"QA Wallet","kind":"Cash","currency":"USD","amount":100,"date":"2026-10-01"}'::jsonb)`);
  await d.exec('RESET ROLE');
  // The bot runs with row security bypassed; a foreign id is refused rather than taken as a new record.
  await assert.rejects(d.query(`SELECT public.telegram_save_finance_record('${stranger}','{"id":"${id(10)}","name":"QA taken","kind":"Cash","currency":"USD","amount":1,"date":"2026-10-01"}'::jsonb)`),/Record not found/);
  const row=(await d.query(`SELECT user_id,name,amount FROM finance_records WHERE id='${id(10)}'`)).rows[0];
  assert.deepEqual([row.user_id,row.name,Number(row.amount)],[owner,'QA Wallet',100]);
  // The owner still edits their own record.
  await as(d,owner);
  const revision=(await d.query(`SELECT revision FROM finance_records WHERE id='${id(10)}'`)).rows[0].revision;
  await d.query(`SELECT public.save_finance_record('{"id":"${id(10)}","name":"QA Wallet renamed","kind":"Cash","currency":"USD","amount":100,"date":"2026-10-01"}'::jsonb,${revision})`);
  assert.equal((await d.query(`SELECT name FROM finance_records WHERE id='${id(10)}'`)).rows[0].name,'QA Wallet renamed');
  for(const value of ['NaN','Infinity','1e16'])
   await assert.rejects(d.query(`INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,account_id) VALUES('${id(11)}','${owner}','QA bad','Other expense','USD','${value}','2026-10-02','${id(10)}')`),/figures_bounded/,value);
 }finally{await d.close();}
});

test('a deleted import restores beside the copy imported again',async()=>{
 const d=await db(setup);
 try{
  await as(d,owner);
  await d.query(`SELECT public.save_finance_record('{"id":"${id(20)}","name":"QA Bank","kind":"Cash","currency":"USD","amount":500,"date":"2026-10-01"}'::jsonb)`);
  const rows=JSON.stringify([{key:'a'.repeat(64),amount:-25,date:'2026-10-03',name:'QA Coffee'}]);
  await d.query(`SELECT public.import_statement('${id(21)}','${id(20)}',$1::jsonb)`,[rows]);
  const first=(await d.query(`SELECT id FROM finance_records WHERE import_key=$1`,['a'.repeat(64)])).rows[0].id;
  await d.query(`DELETE FROM finance_records WHERE id=$1`,[first]);
  await d.query(`SELECT public.import_statement('${id(22)}','${id(20)}',$1::jsonb)`,[rows]);
  const deleted=(await d.query(`SELECT id FROM deleted_items WHERE data->>'id'=$1`,[first])).rows[0].id;
  await d.query(`SELECT public.restore_deleted_item($1)`,[deleted]);
  const copies=(await d.query(`SELECT id,import_key FROM finance_records WHERE name='QA Coffee' ORDER BY import_key NULLS FIRST`)).rows;
  assert.equal(copies.length,2,'both copies are kept');
  assert.deepEqual(copies.map(row=>row.import_key),[null,'a'.repeat(64)],'the restored copy gives up its source identifier');
  assert.equal(copies[0].id,first);
 }finally{await d.close();}
});
