import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const id=n=>`13300000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/133_plan_categories_fixed.sql','utf8');
const skip=!process.env.PGLITE_MODULE;
const auth=`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}');`;

test('migration 133 is in setup.sql',()=>{assert.ok(setup.includes(migration));});

test('categories made from spending plans are Fixed, so the Flex style keeps their amounts; others keep their type (migration 133)',{skip},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 try{
  await db.exec(auth);await db.exec(setup.slice(0,setup.indexOf(migration)));
  const plan=(n,name,category)=>db.query('INSERT INTO expense_plans(id,user_id,name,category,currency,amount,start_date) VALUES($1,$2,$3,$4,$5,$6,$7)',[id(n),id(1),name,category,'USD',300,'2026-01-01']);
  const category=(n,name)=>db.query("INSERT INTO transaction_categories(id,user_id,name,direction) VALUES($1,$2,$3,'expense')",[id(n),id(1),name]);
  const setting=(key,fields)=>db.query('INSERT INTO budget_categories(user_id,category_key,budget_type,group_name,rollover,rollover_negative) VALUES($1,$2,$3,$4,$5,$6)',[id(1),key,fields.type??'flexible',fields.group??null,!!fields.rollover,fields.negative??true]);
  // Before 133: two plans become Flexible categories (one with its label as the group, one without).
  await plan(10,'QA Food','Groceries');await plan(11,'QA Gifts','Other');
  // The person's own categories: Flexible with the default negative carry, and one with negative carry off but its own group.
  await category(20,'QA Coffee');await setting(id(20),{});
  await category(21,'QA Hobby');await setting(id(21),{group:'QA Fun',rollover:true,negative:false});
  await setting('Living expense',{negative:false});
  const type=async name=>(await db.query('SELECT b.budget_type FROM budget_categories b JOIN transaction_categories c ON c.id::text=b.category_key WHERE c.name=$1',[name])).rows[0]?.budget_type;
  assert.equal(await type('QA Food'),'flexible');assert.equal(await type('QA Gifts'),'flexible');

  await db.exec(migration);await db.exec(migration);
  assert.deepEqual([await type('QA Food'),await type('QA Gifts'),await type('QA Coffee'),await type('QA Hobby')],['fixed','fixed','flexible','flexible']);
  assert.equal((await db.query("SELECT budget_type FROM budget_categories WHERE category_key='Living expense'")).rows[0].budget_type,'flexible','built-in kinds are never re-typed');
  assert.equal((await db.query("SELECT group_name FROM budget_categories b JOIN transaction_categories c ON c.id::text=b.category_key WHERE c.name='QA Food'")).rows[0].group_name,'Groceries','the group stays');

  // A plan restored later is Fixed from the start.
  await plan(12,'QA Pets','Household');
  assert.equal(await type('QA Pets'),'fixed');
 }finally{await db.close();}
});
