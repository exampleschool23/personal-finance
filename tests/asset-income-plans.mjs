import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`54000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('asset plans backfill once, save atomically, preserve precision and isolate owners',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);
  await db.exec(fs.readFileSync('database/setup.sql','utf8').split('-- Turn income-producing property/business')[0]);
  await db.exec(`SET request.jwt.claim.sub='${id(1)}';INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,estimated_monthly_income) VALUES('${id(10)}','${id(1)}','Beruniy','Property','USD',60000,'2020-01-01','Once',450.125);`);
  await db.exec(fs.readFileSync('migrations/044_asset_income_plans.sql','utf8'));
  await db.exec('SET ROLE authenticated');
  const sources=async()=>(await db.query('SELECT * FROM income_sources')).rows;
  let rows=await sources();assert.equal(rows.length,1);assert.equal(Number(rows[0].amount),450.125);assert.equal(rows[0].kind,'Rent income');
  await db.query('UPDATE finance_records SET estimated_monthly_income=500 WHERE id=$1',[id(10)]);
  assert.equal((await sources()).length,1);
  await db.exec(`INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,estimated_monthly_income) VALUES('${id(11)}','${id(1)}','Business','Business','USD',50000,'2020-01-01','Once',1200),('${id(12)}','${id(1)}','Home','Property','USD',50000,'2020-01-01','Once',0);`);
  rows=await sources();assert.equal(rows.length,2);assert.equal(rows.find(row=>row.linked_record_id===id(11)).kind,'Business income');
  assert.equal((await db.query("SELECT count(*) AS n FROM finance_records WHERE frequency='Once' AND kind IN ('Rent income','Business income')")).rows[0].n,0);
  await db.query('UPDATE finance_records SET estimated_monthly_income=300 WHERE id=$1',[id(12)]);assert.equal((await sources()).length,3);
  await db.exec('BEGIN');
  await db.exec(`INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,estimated_monthly_income) VALUES('${id(14)}','${id(1)}','Rolled back','Property','USD',50000,'2020-01-01','Once',300);`);
  assert.equal((await sources()).length,4);await db.exec('ROLLBACK');assert.equal((await sources()).length,3);
  assert.equal((await db.query('SELECT * FROM finance_records WHERE id=$1',[id(14)])).rows.length,0);
  await db.exec(`SET request.jwt.claim.sub='${id(2)}'`);assert.equal((await sources()).length,0);
  await assert.rejects(db.exec(`INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,estimated_monthly_income) VALUES('${id(13)}','${id(1)}','Foreign','Property','USD',10,'2020-01-01','Once',1);`));
 }finally{await db.close();}
});

import {loadTS} from './helpers/load-ts.mjs';
const {withAssetIncomePlans,legacyEarningSources}=loadTS('lib/earning-sources.ts');
const {estimatedCashFlow}=loadTS('lib/finance.ts');
test('demo generates selectable linked plans without counting asset income twice',()=>{
 const asset={id:id(20),kind:'Property',name:'Qushbegi',currency:'USD',amount:60000,date:'2020-01-01',frequency:'Once',estimated_monthly_income:450.125,quantity:1,ownership_percentage:100};
 const rows=withAssetIncomePlans([asset]);assert.equal(rows.length,2);assert.equal(rows[1].income_source_id,asset.id);
 assert.equal(legacyEarningSources(rows)[0].linked_record_id,asset.id);
 assert.equal(withAssetIncomePlans(rows).length,2);
 assert.equal(estimatedCashFlow(rows,0,'2020-01').plannedIncome,450.125);
 assert.equal(withAssetIncomePlans([asset],[{linked_record_id:asset.id,archived:true}]).length,1);
});
test('picker supports category hover, focus, touch, searching, and keyboard selection',()=>{
 const ui=fs.readFileSync('components/income-source-picker.tsx','utf8');
 for(const expected of ['onMouseEnter','onFocus','onClick','ArrowDown','ArrowUp','ArrowRight','aria-pressed','formatNumber','PopoverContent'])assert.ok(ui.includes(expected));
 for(const locale of ['en','ru','uz']){
  const messages=JSON.parse(fs.readFileSync(`lib/locales/${locale}.json`,'utf8'));
  for(const key of ['All income sources','Income source or category','No income sources found.'])assert.ok(messages[key]);
 }
});

test('income picker owns its scroll lock inside the record dialog',()=>{
 const ui=fs.readFileSync('components/income-source-picker.tsx','utf8');
 // A non-modal body portal sits outside the enclosing dialog's allowed scroll area.
 assert.match(ui,/<Popover modal open=\{open\}/);
 const css=fs.readFileSync('app/globals.css','utf8');
 assert.match(css,/\.income-source-categories, \.income-source-results \{[^}]*overflow-y: auto;[^}]*overscroll-behavior-y: contain;/);
});
