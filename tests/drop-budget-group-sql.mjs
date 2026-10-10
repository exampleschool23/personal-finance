import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadTS } from './helpers/load-ts.mjs';
const id=n=>`14200000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/142_drop_budget_group_name.sql','utf8');
const skip=!process.env.PGLITE_MODULE;
const auth=`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}');`;

test('migration 142 is in setup.sql and bumps the schema version the app requires',()=>{
 assert.ok(setup.includes(migration));
 assert.match(fs.readFileSync('lib/database-capabilities.ts','utf8'),/requiredSchemaVersion = 142;/);
});

test('a category save from an older client keeps working: the API schema strips group_name',()=>{
 const { budgetSchemas }=loadTS('lib/budget-schemas.ts');
 const parsed=budgetSchemas.category.parse({ category_key:'Charity', budget_type:'flexible', group_name:'Family support', rollover:false, rollover_start:null, excluded:false });
 assert.equal('group_name' in parsed,false);
});

test('group_name is dropped, settings are kept, and a restored spending plan still becomes a Fixed category (migration 142)',{skip},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 try{
  await db.exec(auth);await db.exec(setup.slice(0,setup.indexOf(migration)));
  await db.query("INSERT INTO budget_categories(user_id,category_key,budget_type,group_name,rollover,rollover_start) VALUES($1,'Charity','non_monthly','Family support',true,'2026-07-01')",[id(1)]);
  await db.exec(migration);
  const columns=(await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='budget_categories'")).rows.map(row=>row.column_name);
  assert.ok(!columns.includes('group_name'));
  const kept=(await db.query("SELECT budget_type,rollover,to_char(rollover_start,'YYYY-MM') AS start FROM budget_categories WHERE category_key='Charity'")).rows[0];
  assert.deepEqual(kept,{budget_type:'non_monthly',rollover:true,start:'2026-07'});
  const definition=(await db.query("SELECT pg_get_functiondef('public.convert_expense_plan(uuid)'::regprocedure) AS d")).rows[0].d;
  assert.ok(!definition.includes('group_name'));
  await db.query("INSERT INTO expense_plans(id,user_id,name,category,currency,amount,start_date) VALUES($1,$2,'QA Food','Groceries','USD',300,'2026-01-01')",[id(10),id(1)]);
  const category=(await db.query("SELECT b.budget_type FROM budget_categories b JOIN transaction_categories c ON c.id::text=b.category_key WHERE c.name='QA Food'")).rows[0];
  assert.equal(category?.budget_type,'fixed','the restore trigger converts the plan without the dropped column');
  assert.equal((await db.query('SELECT public.finance_capabilities()->>\'schema_version\' AS v')).rows[0].v,'142');
  await db.exec(migration);
 }finally{await db.close();}
});
