import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`72000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const setup=fs.readFileSync('database/setup.sql','utf8');
const repair=fs.readFileSync('migrations/125_repair_recategorize_names.sql','utf8');
async function db(){const d=new PGlite();await d.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}');`);await d.exec(setup);return d;}
const definition=async d=>(await d.query("SELECT pg_get_functiondef('public.recategorize_transactions(uuid[],text,uuid)'::regprocedure) AS sql")).rows[0].sql;
const clauses=sql=>sql.split(',name=CASE').length-1;
// What production got from running migration 118 twice before its guard was fixed: the name clause appended a second time.
async function patchTwice(d){
 const sql=await definition(d),old='SET kind=p_kind,custom_category_id=p_category',clause=sql.slice(sql.indexOf(',name=CASE'),sql.indexOf('ELSE r.name END')+'ELSE r.name END'.length);
 await d.exec(sql.replace(old+clause,old+clause+clause));
}
const expense=d=>d.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES($1,$2,'Living expense','Living expense','USD',55,'2026-10-04','Once')",[id(2),id(1)]);
async function recategorize(d){
 await d.exec(`SET request.jwt.claim.sub='${id(1)}'`);
 return d.query("SELECT public.set_transaction_category(ARRAY[$1]::uuid[],'Charity',NULL) AS changed",[id(2)]);
}

test('a doubled name clause breaks every category change, and 125 repairs it (TX-054)',async()=>{
 const d=await db();
 try{
  await expense(d);await patchTwice(d);
  assert.equal(clauses(await definition(d)),2);
  await assert.rejects(recategorize(d),/multiple assignments to same column "name"/);
  await d.exec('RESET request.jwt.claim.sub');
  await d.exec(repair);
  assert.equal(clauses(await definition(d)),1,'one name clause left');
  assert.equal((await recategorize(d)).rows[0].changed,1);
  assert.deepEqual((await d.query('SELECT kind,name FROM finance_records WHERE id=$1',[id(2)])).rows[0],{kind:'Charity',name:'Charity'},'an untyped name still follows its category');
 }finally{await d.close();}
});

test('migration 125 leaves a healthy function alone and is safe to re-run',async()=>{
 const d=await db();
 try{
  const before=await definition(d);
  await d.exec(repair);await d.exec(repair);
  assert.equal(await definition(d),before);
 }finally{await d.close();}
});

test('migration 125 is in setup.sql',()=>{
 assert.ok(setup.includes(repair),'setup.sql includes migration 125');
});
